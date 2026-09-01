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

        if (!signature) {
            return res.status(400).json({
                message: "missing razorpay webhook signature", 
            })
        }

        //req.body must be the raw request body buffer here 
        const generatedSignature = crypto.createHmac("sha256", process.env.RAZORPAY_WEBHOOK_SECRET)
        .update(req.body)
        .digest("hex");

        if(generatedSignature !== signature) {
            return res.status(400).json({
                message: "invalid webhook signature",
            });
        }

        const payload = JSON.parse(
            req.body.toString("utf8")
        );

        //yha pe sirf successfully captured payments se mtlb rkhenge
        if(payload.event !== "payment.captured" && payload.event !== "order.paid"){
            return res.status(200).json({
                message: "webhook ignored",
            });
        }

        const razorpayPayment = payload.payload?.payment?.entity;
        const razorpayOrder = payload.payload?.order?.entity;
        const razorpayOrderId = razorpayPayment?.order_id || razorpayOrder?.id;
        const razorpayPaymentId = razorpayPayment?.id;

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
                return res.status(200).json({
                    message: "webhook already processed",
                });
            }
        }

        const payment = await Payment.findOne({ razorpayOrderId });
        if(!payment) {
            return res.status(404).json({
                message: "payment record not found"
            });
        }

        //dusri idempotency check krne k liye - ho skta hai ki booking/payment pichle event me hi finalized ho gya ho
        if(payment.status === "SUCCESS"){
            return res.status(200).json({
                message: "payment already finalized",
            });
        }

        const booking = await Booking.findOne({
            _id: payment.bookingId,
            status: "PENDING",
        });

        if(!booking){
            return res.status(409).json({
                message: "pending booking not found",
            });
        }

        if(booking.expiresAt <= new Date()) {
            return res.status(409).json({
                message: "booking expired before payment confirmation",
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
            throw new Error("one or more seats are already booked");
        }

        const bookingResult = await Booking.findOne({
            _id: booking._id, status: "PENDING",
        }, {
            $set: { status: "SUCCESS" },
        }, { session });

        if (bookingResult.modifiedCount !== 1){
            throw new Error( "booking could not be finalized");
        }

        const paymentResult = await Payment.updateOne({
            _id: payment._id,
            status: { $ne: "SUCCESS" },
        }, {
            $set: { status: "SUCCESS", 
                razorpayPaymentId: razorpayPaymentId || null,
                razorpayEventId: eventId || null
            }
        }, { session });

        if(paymentResult.modifiedCount !== 1) {
            throw new Error("payment could not be finalized")
        }
        await session.commitTransaction();

        //mongodb is now the prmanent source of truth, now remove redis temporary locks after commit
        const seatKeys = booking.seats.map((seat) => `seats:${booking.showtimeId}:${seat}`);

        const unlockScript = `
        for _, key in ipairs(KEYS) do
        if redis.call("GET", key) == ARGV[1] then
        redis.call("DEL", key)
        end
        end
        return 1`;

        await redis.eval( unlockScript, seatKeys.length, ...seatKeys, bookinguserId );
        return res.status(200).json({
            message: "payment processed and booking confirmed"
        });

    } catch (error) {
        if (session.inTransaction()) {
            await session.abortTransaction();
        }
        console.error("razorpay webhook error", error);

        return res.status(500).json({
            message: "webhook processing failed",
        });
    } finally {
        await session.endSession();
    }
};

module.exports = { razorpayWebhook };