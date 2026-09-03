const crypto = require("crypto");
const Booking = require("../modules/booking/booking.model");
const Payment = require("../modules/payment/payment.model");
const razorpay = require("../config/razorpay");

const createPaymentOrder = async (req, res) => {
    try {
        const { bookingId, userId } = req.body

        if( !bookingId || !userId ) {
            return res.status(400).json({
                message: "bookingId and userId are required",
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

        //prevent creating multiple active payment orders
        const existingPayment = await Payment.findOne({
            bookingId: booking._id,
            status: "CREATED",
        });

        if (existingPayment){
            return res.status(200).json({
                message: "payment order already exist",
                paymentId: existingPayment._id,
                orderId: existingPayment.razorpayOrderId,
                amount: Math.round(Number(existingPayment.amount) * 100),
                currency: existingPayment.currency,
                keyId: process.env.RAZORPAY_KEY_ID,
                bookingId: booking._id,
            });
        }

        // razorpay expect krta h ki jo amount h wo paise me aaye
        // to uske liye rupee ko paise me convert krna pdega
        const amountInPaise = Math.round(Number(booking.totalAmount) * 100);

        const order = await razorpay.orders.create({
            amount: amountInPaise,
            currency: "INR",
            receipt: `booking_${booking._id}`,
            notes: {
                bookingId: booking._id.toString(),
                userId,
            },
        });

        const payment = await Payment.create({
            bookingId: booking._id,
            userId,
            amount: booking.totalAmount,
            currency: "INR",
            status: "CREATED",
            razorpayOrderId: order.id,
        });

        return res.status(201).json({
            message: "payment order created",
            paymentId: payment._id,
            orderId: order.id,
            amount: order.amount,
            currency: order.currency,
            keyId: process.env.RAZORPAY_KEY_ID,
            bookingId: booking._id,
        })

    } catch (error) {
        console.error("payment order creation error", error);

        return res.status(500).json({
            message: "failed to create payment order",
            error: error.message,
        });
    }
};

const verifyPayment = async (req, res) => {
    try {
        const { razorpay_order_id, razorpay_payment_id, razorpay_signature, userId } = req.body;

        console.log("PAYMENT VERIFY RECEIVED:", {
            razorpay_order_id,
            razorpay_payment_id,
            userId,
            hasSignature: !!razorpay_signature,
        });

        if ( !razorpay_order_id || !razorpay_payment_id || !razorpay_signature || !userId ) {
            return res.status(400).json({
                message: "payment verification fields are required"
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

        const isValid = generatedSignature === razorpay_signature;

        if(!isValid){
            console.error("Payment signature mismatch:", {
                expected: generatedSignature,
                received: razorpay_signature,
            });
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
            error: error.message,
        });
        
    }
}

module.exports = { createPaymentOrder, verifyPayment };