const mongoose = require("mongoose")
const crypto = require("crypto");

const redis = require("../config/redis")
const Payment = require("../modules/payment/payment.model")
const Booking = require("../modules/booking/booking.model")
const Seat = require("../modules/seat/seat.model")

const razorpayWebhook = async (req, res) => {
    const session = await mongoose.startSession();

    try {
        const signature = req.headers["x-razorpay-signature"];
        const eventId = req.headers["x-razorpay-event-id"];

        console.log("=== WEBHOOK RECEIVED ===");
        console.log("Body Buffer:", Buffer.isBuffer(req.body));
        console.log("Signature:", signature);
        console.log("Event ID:", eventId);

        if (!signature) {
            console.error("Missing x-razorpay-signature header");
            return res.status(400).json({
                message: "missing razorpay webhook signature", 
            });
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
        .digest("hex");

        if(generatedSignature !== signature) {
            console.error("Webhook signature mismatch:", {
                expected: generatedSignature,
                received: signature,
            });
            return res.status(400).json({
                message: "invalid webhook signature",
            });
        }

        const payload = JSON.parse(
            req.body.toString("utf8")
        );

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
        const razorpayOrderId = razorpayPayment?.order_id || razorpayOrder?.id;
        const razorpayPaymentId = razorpayPayment?.id;

        console.log("Order ID:", razorpayOrderId);
        console.log("Payment ID:", razorpayPaymentId);

        if(!razorpayOrderId){
            return res.status(400).json({
                message: "razorpay order id missing",
            });
        }

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

        const booking = await Booking.findById(payment.bookingId);

        if(!booking){
            console.error("Booking not found for payment:", payment.bookingId);
            return res.status(404).json({
                message: "booking not found",
            });
        }

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
            // If seats were already taken by someone else (e.g. late payment),
            // we cannot book the seats. Mark payment as FAILED / refund needed.
            await Payment.updateOne({
                _id: payment._id,
            }, {
                $set: {
                    status: "FAILED",
                    razorpayPaymentId: razorpayPaymentId || payment.razorpayPaymentId || null,
                    razorpayEventId: eventId || null,
                }
            }, { session });

            await session.commitTransaction();

            console.warn(`[PAYMENT CONFLICT]: Marked payment ${payment._id} as FAILED for refund.`);
            return res.status(200).json({
                message: "one or more seats are no longer available; payment marked for refund",
            });
        }

        const bookingResult = await Booking.updateOne({
            _id: booking._id,
        }, {
            $set: { status: "SUCCESS" },
        }, { session });

        if (bookingResult.modifiedCount !== 1 && booking.status !== "SUCCESS"){
            throw new Error("booking could not be finalized");
        }

        const paymentResult = await Payment.updateOne({
            _id: payment._id,
            status: { $ne: "SUCCESS" },
        }, {
            $set: { 
                status: "SUCCESS", 
                razorpayPaymentId: razorpayPaymentId || payment.razorpayPaymentId || null,
                razorpayEventId: eventId || null,
            }
        }, { session });

        if(paymentResult.modifiedCount !== 1 && payment.status !== "SUCCESS") {
            throw new Error("payment could not be finalized");
        }

        await session.commitTransaction();
        console.log(`Payment ${payment._id} and Booking ${booking._id} committed as SUCCESS`);

        //mongodb is now the permanent source of truth, now remove redis temporary locks after commit
        const seatKeys = booking.seats.map((seat) => `seats:${booking.showtimeId}:${seat}`);

        const unlockScript = `
        for _, key in ipairs(KEYS) do
        if redis.call("GET", key) == ARGV[1] then
        redis.call("DEL", key)
        end
        end
        return 1`;

        try {
            await redis.eval(unlockScript, seatKeys.length, ...seatKeys, booking.userId);
            console.log("Redis seat locks released successfully");
        } catch (redisErr) {
            console.warn("Failed to release redis locks after commit:", redisErr.message);
        }

        return res.status(200).json({
            message: "payment processed and booking confirmed"
        });

    } catch (error) {
        if (session.inTransaction()) {
            await session.abortTransaction();
        }
        console.error("razorpay webhook error:", error);

        return res.status(500).json({
            message: "webhook processing failed",
            error: error.message,
        });
    } finally {
        await session.endSession();
    }
};

module.exports = { razorpayWebhook };