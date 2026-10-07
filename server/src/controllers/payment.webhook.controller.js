const mongoose = require("mongoose")
const crypto = require("crypto");

const redis = require("../config/redis")
const Payment = require("../modules/payment/payment.model")
const Booking = require("../modules/booking/booking.model")
const Seat = require("../modules/seat/seat.model")


const razorpayWebhook = async (req, res) => {
    let session = null;
    let razorpayOrderId = null;
    let razorpayPaymentId = null;
    let eventId = null;

    try {
        const signature = req.headers["x-razorpay-signature"];
        eventId = req.headers["x-razorpay-event-id"];

        console.log("=== WEBHOOK RECEIVED ===");
        console.log("Body Buffer:", Buffer.isBuffer(req.body));
        console.log("Event ID:", eventId);

        if (typeof signature !== "string" || !/^[a-fA-F0-9]{64}$/.test(signature)) {
            console.error("Missing or invalid x-razorpay-signature header");
            return res.status(400).json({
                message: "missing or invalid razorpay webhook signature",
            });
        }

        if (eventId !== undefined && (typeof eventId !== "string" || !eventId.trim())) {
            return res.status(400).json({ message: "invalid razorpay event id" });
        }

        if (!Buffer.isBuffer(req.body)) {
            console.error("Webhook body is not a Buffer. Check raw body parser middleware.");
            return res.status(400).json({
                message: "raw body required for webhook signature verification",
            });
        }

        //req.body must be the raw request body buffer here 
        const generatedSignature = crypto.createHmac("sha256", process.env.RAZORPAY_WEBHOOK_SECRET)
        .update(req.body)
        .digest();

        if(!crypto.timingSafeEqual(generatedSignature, Buffer.from(signature, "hex"))) {
            console.error("Webhook signature mismatch");
            return res.status(400).json({
                message: "invalid webhook signature",
            });
        }

        let payload;
        try {
            payload = JSON.parse(req.body.toString("utf8"));
        } catch {
            return res.status(400).json({ message: "invalid webhook JSON" });
        }

        if (!payload || typeof payload.event !== "string") {
            return res.status(400).json({ message: "invalid webhook event" });
        }

        console.log("Event:", payload.event);

        //yha pe sirf successfully captured payments se mtlb rkhenge
        if(payload.event !== "payment.captured" && payload.event !== "order.paid"){
            console.log("Webhook event ignored:", payload.event);
            return res.status(200).json({
                message: "webhook ignored",
            });
        }

        const razorpayPayment = payload.payload?.payment?.entity;
        const razorpayOrder = payload.payload?.order?.entity;
        const orderId = razorpayPayment?.order_id || razorpayOrder?.id;
        const paymentId = razorpayPayment?.id;

        if(typeof orderId !== "string" || !orderId.trim() ||
            typeof paymentId !== "string" || !paymentId.trim()){
            return res.status(400).json({
                message: "valid razorpay order id and payment id are required",
            });
        }

        razorpayOrderId = orderId;
        razorpayPaymentId = paymentId;

        console.log("Order ID:", razorpayOrderId);
        console.log("Payment ID:", razorpayPaymentId);

        //idempotency - if we have already processed this exact webhook event,
        //then return success without processing it again
        if(eventId){
            const alreadyProcessed = await Payment.findOne({
                razorpayEventId: eventId,
                status: "SUCCESS",
            });

            if(alreadyProcessed){
                console.log(`Webhook event ${eventId} already processed.`);
                return res.status(200).json({
                    message: "webhook already processed",
                });
            }
        }

        const payment = await Payment.findOne({ razorpayOrderId });
        if(!payment) {
            console.error("Payment record not found for razorpayOrderId:", razorpayOrderId);
            return res.status(404).json({
                message: "payment record not found"
            });
        }

        //dusri idempotency check krne k liye - ho skta hai ki booking/payment pichle event me hi finalized ho gya ho
        if(payment.status === "SUCCESS"){
            console.log(`Payment ${payment._id} already finalized.`);
            return res.status(200).json({
                message: "payment already finalized",
            });
        }

        if(payment.status !== "CREATED"){
            return res.status(200).json({
                message: payment.status === "REFUND_REQUIRED"
                    ? "captured payment requires refund reconciliation"
                    : "payment already processed",
            });
        }

        const booking = await Booking.findById(payment.bookingId);

        if(!booking){
            console.error("Booking not found for payment:", payment.bookingId);
            return res.status(404).json({
                message: "booking not found",
            });
        }

        //check krne k liye ki this booking still owns all temporary seats lock or not
        const seatKeys = booking.seats.map((seat) => `seats:${booking.showtimeId}:${seat}`);

        const lockOwners = await Promise.all( seatKeys.map((key) => redis.get(key)));

        const ownsAllLocks = lockOwners.every((owner) => owner === booking._id.toString());

        if (!ownsAllLocks || booking.status !== "PENDING" || booking.expiresAt <= new Date()) {
            console.warn(`Booking ${booking._id} is no longer pending, has expired, or lost its seat locks`);

            const refundPayment = await Payment.updateOne({ _id: payment._id, status: "CREATED" },{
                $set: { 
                    status: "REFUND_REQUIRED",
                    razorpayPaymentId: razorpayPaymentId || payment.razorpayPaymentId || null,
                    razorpayEventId: eventId || null,
                },
            });

            if (refundPayment.modifiedCount === 0) {
                const latestPayment = await Payment.findById(payment._id);

                if (latestPayment?.status === "SUCCESS"){
                    console.log(`Payment ${payment._id} was already finalized by another webhook`);
                    
                    return res.status(200).json({
                        message: "payment already finalized",
                    });
                }

                if (latestPayment?.status !== "REFUND_REQUIRED") {
                    return res.status(200).json({ message: "payment already processed" });
                }
            }

            return res.status(200).json({
                message: "booking cannot be fulfilled; captured payment requires refund reconciliation",
            });
        }

        session = await mongoose.startSession();
        session.startTransaction();

        //har seat ko permanently reserve krne k liye
        const result = await Seat.updateMany({
            showtimeId: booking.showtimeId, 
            seatNumber: { $in: booking.seats },
            status: "AVAILABLE",
        },{
            $set: { status: "BOOKED", bookingId: booking._id },
        },{ session });

        if(result.modifiedCount !== booking.seats.length ){
            console.warn(`Seats conflict: expected ${booking.seats.length} available, modified ${result.modifiedCount}`);

            await session.abortTransaction();
            // If seats were already taken by someone else (e.g. late payment),
            // we cannot book the seats. Captured money needs refund reconciliation.
            const refundPayment = await Payment.updateOne(
                { _id: payment._id, status: "CREATED" }, {
                $set: {
                    status: "REFUND_REQUIRED",
                    razorpayPaymentId: razorpayPaymentId || payment.razorpayPaymentId || null,
                    razorpayEventId: eventId || null,
                }
            });

            if(refundPayment.modifiedCount === 0) {
                const latestPayment = await Payment.findById(payment._id);
                
                if(latestPayment?.status === "SUCCESS"){
                    console.log(`Payment ${payment._id} was already finalized by another webhook`);
                    
                    return res.status(200).json({
                        message: "payment already finalized",
                    });
                }

                if (latestPayment?.status !== "REFUND_REQUIRED") {
                    return res.status(200).json({ message: "payment already processed" });
                }
            }

            console.warn(`[PAYMENT CONFLICT]: Payment ${payment._id} requires refund reconciliation.`);
            return res.status(200).json({
                message: "one or more seats are no longer available; captured payment requires refund reconciliation",
            });
        }

        const bookingResult = await Booking.updateOne({
            _id: booking._id,
            status: "PENDING",
            expiresAt: { $gt: new Date() },
        }, {
            $set: { status: "SUCCESS" },
        }, { session });

        if (bookingResult.modifiedCount !== 1){
            const error = new Error("booking could not be finalized");
            error.code = "BOOKING_UNFULFILLABLE";
            throw error;
        }

        const paymentResult = await Payment.updateOne({
            _id: payment._id,
            status: "CREATED",
        }, {
            $set: { 
                status: "SUCCESS", 
                razorpayPaymentId: razorpayPaymentId || payment.razorpayPaymentId || null,
                razorpayEventId: eventId || null,
            }
        }, { session });

        if(paymentResult.modifiedCount !== 1) {
            throw new Error("payment could not be finalized");
        }

        await session.commitTransaction();
        console.log(`Payment ${payment._id} and Booking ${booking._id} committed as SUCCESS`);

        //mongodb is now the permanent source of truth, now remove redis temporary locks after commit
        //const seatKeys = booking.seats.map((seat) => `seats:${booking.showtimeId}:${seat}`);

        const unlockScript = `
        for _, key in ipairs(KEYS) do
        if redis.call("GET", key) == ARGV[1] then
        redis.call("DEL", key)
        end
        end
        return 1`;

        try {
            await redis.eval(unlockScript, seatKeys.length, ...seatKeys, booking._id.toString());
            console.log("Redis seat locks released successfully");
        } catch (redisErr) {
            console.warn("Failed to release redis locks after commit:", redisErr.message);
        }

        return res.status(200).json({
            message: "payment processed and booking confirmed"
        });

    } catch (error) {
        console.error("razorpay webhook error:", error);

        try {
            if (session?.inTransaction()) {
                await session.abortTransaction();
            }

            //another concurrent webhook may have already completed the payment
            if(razorpayOrderId){
                const latestPayment = await Payment.findOne({ razorpayOrderId });

                if(latestPayment?.status === "SUCCESS"){
                    console.log(`Payment ${latestPayment._id} was already finalized by another webhook`);

                    return res.status(200).json({
                        message: "payment already finalized",
                    });
                }

                if (error.code === "BOOKING_UNFULFILLABLE" && latestPayment) {
                    await Payment.updateOne({ _id: latestPayment._id, status: "CREATED" }, {
                        $set: {
                            status: "REFUND_REQUIRED",
                            razorpayPaymentId,
                            razorpayEventId: eventId || null,
                        },
                    });
                    const currentPayment = await Payment.findById(latestPayment._id);
                    return res.status(200).json({
                        message: currentPayment?.status === "SUCCESS"
                            ? "payment already finalized"
                            : currentPayment?.status === "REFUND_REQUIRED"
                                ? "booking cannot be fulfilled; captured payment requires refund reconciliation"
                                : "payment already processed",
                    });
                }
            }
        } catch (recoveryError) {
            console.error("Webhook transaction rollback or payment recheck failed:", recoveryError);
        }
        return res.status(500).json({
            message: "webhook processing failed",
        });
    } finally {
        if (session) {
            await session.endSession();
        }
    }
};

module.exports = { razorpayWebhook };
