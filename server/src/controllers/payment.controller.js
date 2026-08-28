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
                orderId: existingPayment.razorpayOrderId,
                amount: existingPayment.amount,
                currency: existingPayment.currency,
            });
        }

        // razorpay expect krta h ki jo amount h wo paise me aaye
        // to uske liye rupee ko paise me convert krna pdega
        const amountPaise = Math.round(Number(booking.totalAmount) * 100);

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
            orderId: order._id,
            amount: order.amount,
            currency: order.currency,
            keyId: process.env.RAZORPAY_KEY_ID,
            bookingId: booking._id,
        })

    } catch (error) {
        console.error("payment order creation error", error);

        return res.status(500).json({
            message: "failed to create payment order";
        });
    }
};

module.exports = { createPaymentOrder };