const crypto = require("crypto");
const mongoose = require("mongoose");
const Booking = require("../modules/booking/booking.model");
const Payment = require("../modules/payment/payment.model");
const Showtime = require("../modules/catalog/showtime.model");
const razorpay = require("../config/razorpay");

const createPaymentOrder = async (req, res) => {
    let claimedBookingId = null;
    let createdOrderId = null;
    try {
        const { bookingId } = req.body || {};

        //userid comes from verified JWT
        const userId = req.user.userId;

        if( typeof bookingId !== "string" || !mongoose.isObjectIdOrHexString(bookingId) ) {
            return res.status(400).json({
                message: "a valid bookingId is required",
            });
        }

        const booking = await Booking.findOne({
            _id: bookingId,
            userId,
            status: "PENDING",
        });

        if (!booking) {
            return res.status(404).json({
                message: "pending booking not found"
            });
        }

        if (booking.expiresAt <= new Date()) {
            return res.status(409).json({
                message: "booking has expired",
            });
        }

        const showtime = await Showtime.findById(booking.showtimeId);
        if (!showtime || showtime.startTime <= new Date()) {
            return res.status(409).json({
                message: "showtime is no longer bookable",
            });
        }

        // razorpay expect krta h ki jo amount h wo paise me aaye
        // to uske liye rupee ko paise me convert krna pdega
        const amountInPaise = Math.round(Number(booking.totalAmount) * 100);
        if (!Number.isSafeInteger(amountInPaise) || amountInPaise <= 0) {
            return res.status(400).json({
                message: "booking amount is invalid",
            });
        }

        const paymentFilter = {
            bookingId: booking._id,
            status: { $in: ["CREATED", "SUCCESS", "REFUND_REQUIRED", "REFUNDED"] },
        };
        let payment = await Payment.findOne(paymentFilter).sort({ createdAt: -1 });
        let created = false;

        if (!payment) {
            // Claim in MongoDB before calling Razorpay so concurrent requests cannot create two orders.
            const claimedBooking = await Booking.findOneAndUpdate({
                _id: booking._id,
                userId,
                status: "PENDING",
                expiresAt: { $gt: new Date() },
                paymentOrderPending: { $ne: true },
            }, {
                $set: { paymentOrderPending: true },
            }, { returnDocument: "after" });

            if (claimedBooking) claimedBookingId = booking._id;

            // A previous request may have saved its payment since the first lookup.
            payment = await Payment.findOne(paymentFilter).sort({ createdAt: -1 });

            if (!claimedBooking && !payment) {
                return res.status(409).json({
                    message: "payment order creation is pending; retry shortly or contact support if it persists",
                });
            }

            if (claimedBooking && !payment) {
                const order = await razorpay.orders.create({
                    amount: amountInPaise,
                    currency: "INR",
                    receipt: `booking_${booking._id}`,
                    notes: {
                        bookingId: booking._id.toString(),
                        userId,
                    },
                });
                createdOrderId = order.id;

                try {
                    payment = await Payment.create({
                        bookingId: booking._id,
                        userId,
                        amount: booking.totalAmount,
                        currency: "INR",
                        status: "CREATED",
                        razorpayOrderId: order.id,
                    });
                    created = true;
                } catch (error) {
                    if (error.code !== 11000) throw error;
                    payment = await Payment.findOne(paymentFilter).sort({ createdAt: -1 });
                    if (!payment) throw error;
                }
            }

            if (claimedBooking) {
                await Booking.updateOne({ _id: booking._id }, {
                    $set: { paymentOrderPending: false },
                });
                claimedBookingId = null;
            }
        }

        if (payment.status !== "CREATED") {
            return res.status(409).json({
                message: "payment has already been processed; check booking status",
            });
        }

        return res.status(created ? 201 : 200).json({
            message: created ? "payment order created" : "payment order already exists",
            paymentId: payment._id,
            orderId: payment.razorpayOrderId,
            amount: Math.round(Number(payment.amount) * 100),
            currency: payment.currency,
            keyId: process.env.RAZORPAY_KEY_ID,
            bookingId: booking._id,
        })

    } catch (error) {
        console.error("payment order creation error", error);
        if (claimedBookingId) {
            // Keep the claim after an ambiguous gateway/save error; retrying could charge twice.
            console.error("Payment order requires reconciliation before retry", {
                bookingId: claimedBookingId,
                razorpayOrderId: createdOrderId,
            });
        }

        return res.status(500).json({
            message: "payment order could not be confirmed; retry shortly or contact support if it persists",
        });
    }
};

const verifyPayment = async (req, res) => {
    try {
        const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body || {};

        console.log("PAYMENT VERIFY RECEIVED:", {
            razorpay_order_id,
            razorpay_payment_id,
            hasSignature: !!razorpay_signature,
        });

        //userid comes from verifies jwt
        const userId = req.user.userId;

        if ( typeof razorpay_order_id !== "string" || !/^order_[A-Za-z0-9]+$/.test(razorpay_order_id) ||
             typeof razorpay_payment_id !== "string" || !/^pay_[A-Za-z0-9]+$/.test(razorpay_payment_id) ||
             typeof razorpay_signature !== "string" || !/^[a-fA-F0-9]{64}$/.test(razorpay_signature) ) {
            return res.status(400).json({
                message: "valid payment verification fields are required"
            });
        }

        //to find the payment records
        const payment = await Payment.findOne({
            razorpayOrderId: razorpay_order_id,
            userId,
        });

        if(!payment){
            console.error("Payment record not found for order:", razorpay_order_id, "userId:", userId);
            return res.status(404).json({
                message: "payment record not found"
            });
        }

        const generatedSignature = crypto.createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
        .update(razorpay_order_id + "|" + razorpay_payment_id)
        .digest("hex");

        const isValid = crypto.timingSafeEqual(
            Buffer.from(generatedSignature, "hex"),
            Buffer.from(razorpay_signature, "hex")
        );

        if(!isValid){
            console.error("Payment signature mismatch");
            return res.status(400).json({
                message: "invalid payment signature"
            });
        }

        payment.razorpayPaymentId = razorpay_payment_id;
        payment.razorpaySignature = razorpay_signature;

        await payment.save();

        console.log(`Payment record ${payment._id} verified and updated with razorpayPaymentId and signature`);

        return res.status(200).json({
            message: "payment signature verified",
            paymentId: payment._id,
            bookingId: payment.bookingId,
        });

    } catch (error) {
        console.error("payment verification error", error);

        return res.status(500).json({
            message: "failed to verify payment",
        });
        
    }
}

module.exports = { createPaymentOrder, verifyPayment };
