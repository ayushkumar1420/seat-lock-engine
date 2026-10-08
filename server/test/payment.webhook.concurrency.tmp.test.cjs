// Temporary, isolated controller tests. Run from the repository root:
// node --test server/test/payment.webhook.concurrency.tmp.test.cjs
//
// Only this file's loopback HTTP server is contacted. No .env, production app,
// database/Redis configuration, Razorpay SDK, or real database is loaded.
// The actual controller and router run unchanged in a VM with an allowlisted
// require(). Express/raw-body parsing and HMAC verification are real.
// MongoDB/Redis behavior is mocked: these are deterministic interleaving tests,
// NOT evidence of real MongoDB conflict detection, isolation, or Redis atomicity.

const assert = require("node:assert/strict");
const { test } = require("node:test");
const { AsyncLocalStorage } = require("node:async_hooks");
const { createHmac } = require("node:crypto");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const vm = require("node:vm");
const express = require("express");

const BOOKING_ID = "000000000000000000000001";
const PAYMENT_ID = "000000000000000000000002";
const SHOWTIME_ID = "000000000000000000000003";
const OTHER_BOOKING_ID = "000000000000000000000004";
const ORDER_ID = "order_IsolatedFixture";
const SECRET = "isolated-test-only-not-a-real-webhook-secret";
const EVENT_ID = "evt_isolated_same_delivery";
const copy = (value) => structuredClone(value);

function deferred() {
    let resolve;
    const promise = new Promise((done) => { resolve = done; });
    return { promise, resolve };
}

function matches(document, filter) {
    return Object.entries(filter).every(([key, value]) => {
        if (value && typeof value === "object") {
            if ("$in" in value) return value.$in.includes(document[key]);
            if ("$gt" in value) return document[key] > value.$gt;
            throw new Error(`Unsupported mock query operator for ${key}`);
        }
        return document[key] === value;
    });
}

function loadIsolated(relativePath, dependencies, logs) {
    const filename = path.join(__dirname, "..", relativePath);
    const module = { exports: {} };
    vm.runInNewContext(fs.readFileSync(filename, "utf8"), {
        module,
        exports: module.exports,
        Buffer,
        // This does not change the host process environment or any .env file.
        process: { env: { RAZORPAY_WEBHOOK_SECRET: SECRET } },
        console: Object.fromEntries(["log", "warn", "error"].map((level) =>
            [level, (...args) => logs.push({ level, args })])),
        require(name) {
            if (!Object.hasOwn(dependencies, name)) {
                throw new Error(`Blocked unexpected dependency: ${name}`);
            }
            return dependencies[name];
        },
    }, { filename, timeout: 1000 });
    return module.exports;
}

async function fixture(t, options = {}) {
    const deliveries = options.deliveries || 1;
    const participants = options.staleLockRead ? 1 : deliveries;
    const context = new AsyncLocalStorage();
    const readsReady = deferred();
    const writesReady = deferred();
    const committed = deferred();
    const losersResponded = deferred();
    const logs = [];
    const trace = [];
    const sessions = [];
    const commits = [];
    let revision = 0;
    let initialReads = 0;
    let seatWrites = 0;
    let conflictResponses = 0;
    let requestCount = 0;
    let database = {
        payment: {
            _id: PAYMENT_ID, bookingId: BOOKING_ID, userId: "fixture-user",
            status: "CREATED", amount: 200, currency: "INR",
            razorpayOrderId: ORDER_ID, razorpayEventId: null,
            razorpayPaymentId: null,
        },
        booking: {
            _id: BOOKING_ID, showtimeId: SHOWTIME_ID, userId: "fixture-user",
            seats: ["A1", "A2"], status: "PENDING",
            expiresAt: new Date(Date.now() + 600000),
        },
        seats: ["A1", "A2"].map((seatNumber) => ({
            showtimeId: SHOWTIME_ID, seatNumber, status: "AVAILABLE", bookingId: null,
        })),
    };
    if (options.partialConflict) {
        database.seats[1].status = "BOOKED";
        database.seats[1].bookingId = OTHER_BOOKING_ID;
    }
    const locks = new Map(database.booking.seats.map((seat) =>
        [`seats:${SHOWTIME_ID}:${seat}`, BOOKING_ID]));

    function writeConflict() {
        const error = new Error("Simulated MongoDB write conflict");
        error.code = 112;
        error.errorLabels = ["TransientTransactionError"];
        return error;
    }

    function updateOne(collection, filter, update, { session } = {}) {
        if (session) assert.equal(session.active, true);
        const target = session ? session.draft : database;
        const document = target[collection];
        const matched = matches(document, filter);
        trace.push({ op: "update", collection, filter: copy(filter),
            update: copy(update), session: session?.id || null, modified: Number(matched) });
        if (matched) Object.assign(document, copy(update.$set));
        return { modifiedCount: Number(matched) };
    }

    const Payment = {
        async findOne(filter) {
            // Return a snapshot, not a live reference to subsequently committed data.
            const result = matches(database.payment, filter) ? copy(database.payment) : null;
            if (filter.razorpayOrderId && initialReads < deliveries) {
                initialReads++;
                if (initialReads === deliveries) readsReady.resolve();
                await readsReady.promise;
            }
            return result;
        },
        async findById(id) { return id === PAYMENT_ID ? copy(database.payment) : null; },
        async updateOne(...args) { return updateOne("payment", ...args); },
    };
    const Booking = {
        async findById(id) { return id === BOOKING_ID ? copy(database.booking) : null; },
        async updateOne(...args) { return updateOne("booking", ...args); },
    };
    const Seat = {
        async updateMany(filter, update, { session }) {
            assert.equal(session.active, true);
            seatWrites++;
            if (seatWrites === participants) writesReady.resolve();
            await writesReady.promise;
            // Explicitly inject both meaningful orderings. This is a model of an
            // outcome, not a claim to reproduce MongoDB's lock/snapshot engine.
            if (session.id > 1) {
                if (options.conflictTiming !== "beforeCommit") await committed.promise;
                trace.push({ op: "writeConflict", session: session.id });
                throw writeConflict();
            }
            let modifiedCount = 0;
            for (const seat of session.draft.seats) {
                if (matches(seat, filter)) {
                    Object.assign(seat, copy(update.$set));
                    modifiedCount++;
                }
            }
            trace.push({ op: "stageSeats", modifiedCount, session: session.id });
            // Staging must not publish any permanent seat writes.
            assert.equal(database.seats[0].status, "AVAILABLE");
            return { modifiedCount };
        },
    };
    const mongoose = {
        async startSession() {
            const session = {
                id: sessions.length + 1,
                active: false,
                ended: false,
                startTransaction() {
                    this.active = true;
                    this.baseRevision = revision;
                    this.draft = copy(database);
                    trace.push({ op: "begin", session: this.id });
                },
                inTransaction() { return this.active; },
                async abortTransaction() {
                    assert.equal(this.active, true);
                    this.active = false;
                    this.draft = null;
                    trace.push({ op: "abort", session: this.id });
                },
                async commitTransaction() {
                    if (options.conflictTiming === "beforeCommit" && participants > 1) {
                        await losersResponded.promise;
                    }
                    assert.equal(this.active, true);
                    if (this.baseRevision !== revision) throw writeConflict();
                    // Publish the entire draft in one step, never one seat at a time.
                    database = copy(this.draft);
                    revision++;
                    this.active = false;
                    commits.push(copy(database));
                    trace.push({ op: "commit", session: this.id });
                    committed.resolve();
                },
                async endSession() {
                    assert.equal(this.active, false);
                    this.ended = true;
                },
            };
            sessions.push(session);
            return session;
        },
    };
    const redis = {
        async get(key) {
            if (options.staleLockRead && context.getStore() > 1) {
                await committed.promise;
                return null;
            }
            return locks.get(key) || null;
        },
        async eval(script, count, ...args) {
            const owner = args.pop();
            assert.equal(owner, BOOKING_ID);
            assert.equal(count, args.length);
            assert.match(script, /redis\.call\("GET", key\) == ARGV\[1\]/);
            assert.equal(database.payment.status, "SUCCESS");
            assert.equal(database.booking.status, "SUCCESS");
            for (const key of args) if (locks.get(key) === owner) locks.delete(key);
            trace.push({ op: "unlock", owner });
            return 1;
        },
    };

    const controller = loadIsolated("src/controllers/payment.webhook.controller.js", {
        mongoose,
        crypto: require("node:crypto"),
        "../config/redis": redis,
        "../modules/payment/payment.model": Payment,
        "../modules/booking/booking.model": Booking,
        "../modules/seat/seat.model": Seat,
    }, logs);
    const router = loadIsolated("src/modules/payment/payment.webhook.routes.js", {
        express,
        "../../controllers/payment.webhook.controller": controller,
    }, logs);
    const app = express();
    app.use((req, res, next) => {
        requestCount++;
        res.on("finish", () => {
            if (res.statusCode === 500 && ++conflictResponses === participants - 1) {
                losersResponded.resolve();
            }
        });
        context.run(requestCount, next);
    });
    app.use("/api/webhooks", router);
    app.use(express.json());
    const server = http.createServer(app);
    await new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(0, "127.0.0.1", resolve);
    });
    t.after(async () => {
        for (const gate of [readsReady, writesReady, committed, losersResponded]) gate.resolve();
        server.closeAllConnections();
        await new Promise((resolve) => server.close(resolve));
    });

    const body = Buffer.from(JSON.stringify({
        entity: "event", event: "order.paid", contains: ["payment", "order"],
        payload: {
            payment: { entity: {
                id: "pay_IsolatedFixture", entity: "payment", order_id: ORDER_ID,
                amount: 20000, currency: "INR", status: "captured", captured: true,
            } },
            order: { entity: {
                id: ORDER_ID, entity: "order", amount: 20000, amount_paid: 20000,
                amount_due: 0, currency: "INR", status: "paid",
            } },
        },
    }));
    async function deliver(eventId = EVENT_ID, invalidSignature = false) {
        const signature = invalidSignature ? "0".repeat(64)
            : createHmac("sha256", SECRET).update(body).digest("hex");
        return new Promise((resolve, reject) => {
            const request = http.request({
                hostname: "127.0.0.1", port: server.address().port,
                path: "/api/webhooks/razorpay", method: "POST", agent: false,
                headers: {
                    "content-type": "application/json", "content-length": body.length,
                    "x-razorpay-signature": signature, "x-razorpay-event-id": eventId,
                },
            }, (response) => {
                const chunks = [];
                response.on("data", (chunk) => chunks.push(chunk));
                response.on("error", reject);
                response.on("end", () => {
                    try {
                        resolve({ status: response.statusCode,
                            body: JSON.parse(Buffer.concat(chunks).toString("utf8")) });
                    } catch (error) { reject(error); }
                });
            });
            request.setTimeout(4000, () => request.destroy(new Error("Fixture HTTP timeout")));
            request.on("error", reject);
            request.end(body);
        });
    }

    function assertSuccess() {
        assert.equal(commits.length, 1, "exactly one transaction commits");
        assert.equal(database.payment.status, "SUCCESS");
        assert.equal(database.booking.status, "SUCCESS");
        assert.equal(database.payment.razorpayPaymentId, "pay_IsolatedFixture");
        assert.equal(database.payment.razorpayEventId, EVENT_ID);
        assert.ok(database.seats.every((seat) => seat.status === "BOOKED" && seat.bookingId === BOOKING_ID));
        assert.ok(commits.every((state) => state.payment.status === "SUCCESS" &&
            state.booking.status === "SUCCESS" && state.seats.every((seat) => seat.status === "BOOKED")),
        "no partial seat set was published");
        for (const collection of ["payment", "booking"]) {
            assert.equal(trace.filter((entry) => entry.op === "update" && entry.collection === collection &&
                entry.update.$set.status === "SUCCESS" && entry.modified === 1).length, 1);
        }
        assert.equal(trace.filter((entry) => entry.op === "update" && entry.collection === "payment" &&
            ["FAILED", "REFUND_REQUIRED"].includes(entry.update.$set.status) && entry.modified === 1).length, 0);
        assert.ok(sessions.every((session) => session.ended && !session.active));
        assert.equal(locks.size, 0);
    }
    return { deliver, assertSuccess, trace, commits, sessions, locks,
        state: () => copy(database), writes: () => seatWrites };
}

test("MOCK: 3 simultaneous identical deliveries; conflicts observed after winning commit", { timeout: 10000 }, async (t) => {
    const f = await fixture(t, { deliveries: 3 });
    const responses = await Promise.all([f.deliver(), f.deliver(), f.deliver()]);
    assert.deepEqual(responses.map((r) => r.status), [200, 200, 200]);
    assert.equal(responses.filter((r) => r.body.message === "payment processed and booking confirmed").length, 1);
    assert.equal(responses.filter((r) => r.body.message === "payment already finalized").length, 2);
    assert.equal(f.sessions.length, 3);
    assert.equal(f.trace.filter((entry) => entry.op === "writeConflict").length, 2);
    assert.equal(f.trace.filter((entry) => entry.op === "abort").length, 2);
    assert.equal(f.writes(), 3, "all handlers reached overlapping transaction writes");
    f.assertSuccess();
    t.diagnostic("Actual loopback HTTP: 200, 200, 200. MongoDB conflicts are injected, not real.");
});

test("MOCK: conflict before winner commits returns 500; same-event retry is idempotent", { timeout: 10000 }, async (t) => {
    const f = await fixture(t, { deliveries: 2, conflictTiming: "beforeCommit" });
    const responses = await Promise.all([f.deliver(), f.deliver()]);
    assert.deepEqual(responses.map((r) => r.status).sort(), [200, 500]);
    assert.equal(responses.find((r) => r.status === 500).body.message, "webhook processing failed");
    f.assertSuccess();
    const beforeRetry = f.state();
    const writesBefore = f.writes();
    const retry = await f.deliver();
    assert.equal(retry.status, 200);
    assert.equal(retry.body.message, "webhook already processed");
    assert.deepEqual(f.state(), beforeRetry);
    assert.equal(f.writes(), writesBefore);
    f.assertSuccess();
    t.diagnostic("Immediate all-200 acknowledgement is NOT guaranteed: 200, 500; retry 200. No downgrade or partial commit.");
});

test("MOCK: identical replay and distinct event ID for the same successful payment do no more writes", { timeout: 10000 }, async (t) => {
    const f = await fixture(t, { deliveries: 2 });
    await Promise.all([f.deliver(), f.deliver()]);
    f.assertSuccess();
    const beforeReplay = f.state();
    const writesBefore = f.writes();
    const responses = await Promise.all([f.deliver(), f.deliver("evt_isolated_distinct")]);
    assert.deepEqual(responses.map((r) => r.status), [200, 200]);
    assert.equal(responses[0].body.message, "webhook already processed");
    assert.equal(responses[1].body.message, "payment already finalized");
    assert.deepEqual(f.state(), beforeReplay);
    assert.equal(f.writes(), writesBefore);
    f.assertSuccess();
});

test("MOCK: stale CREATED read plus lost locks cannot downgrade concurrently committed SUCCESS", { timeout: 10000 }, async (t) => {
    const f = await fixture(t, { deliveries: 2, staleLockRead: true });
    const responses = await Promise.all([f.deliver(), f.deliver()]);
    assert.deepEqual(responses.map((r) => r.status), [200, 200]);
    const refundAttempt = f.trace.find((entry) => entry.op === "update" &&
        entry.collection === "payment" && entry.update.$set.status === "REFUND_REQUIRED");
    assert.ok(refundAttempt, "must actually exercise the conditional refund branch");
    assert.equal(refundAttempt.filter.status, "CREATED");
    assert.equal(refundAttempt.modified, 0);
    f.assertSuccess();
});

test("MOCK: partial multi-seat update is rolled back before REFUND_REQUIRED; replay is idempotent", { timeout: 10000 }, async (t) => {
    const f = await fixture(t, { partialConflict: true });
    const before = f.state();
    const response = await f.deliver();
    assert.equal(response.status, 200);
    assert.match(response.body.message, /requires refund reconciliation/);
    assert.equal(f.commits.length, 0);
    assert.deepEqual(f.state().seats, before.seats);
    assert.equal(f.state().booking.status, "PENDING");
    assert.equal(f.state().payment.status, "REFUND_REQUIRED");
    const stage = f.trace.find((entry) => entry.op === "stageSeats");
    assert.equal(stage.modifiedCount, 1, "must stage a genuinely partial update");
    const abortIndex = f.trace.findIndex((entry) => entry.op === "abort");
    const refundIndex = f.trace.findIndex((entry) => entry.op === "update" && entry.collection === "payment");
    assert.ok(abortIndex >= 0 && refundIndex > abortIndex);
    assert.equal(f.trace[refundIndex].session, null, "refund must be outside the aborted transaction");
    assert.equal(f.trace[refundIndex].filter.status, "CREATED");
    assert.ok(f.sessions.every((session) => session.ended));
    const afterConflict = f.state();
    const replay = await f.deliver();
    assert.equal(replay.status, 200);
    assert.deepEqual(f.state(), afterConflict);
    assert.equal(f.writes(), 1);
});

test("Real raw-body route rejects invalid HMAC before any mocked database transaction", { timeout: 10000 }, async (t) => {
    const f = await fixture(t);
    const before = f.state();
    const response = await f.deliver(EVENT_ID, true);
    assert.equal(response.status, 400);
    assert.equal(f.sessions.length, 0);
    assert.deepEqual(f.state(), before);
});

test("REAL MongoDB transaction conflict/isolation coverage", {
    skip: "No isolated MongoDB replica set was available. Mocked outcomes do not establish real database concurrency coverage.",
}, () => {});
