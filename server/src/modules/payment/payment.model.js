const mongoose = require("mongoose");

const paymentSchema = new mongoose.Schema(
    {
        bookingId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Booking",
            required: true,
            index: true,
        },

        userId: {
            type: String,
            required: true,
        },

        amount: {
            type: Number,
            required: true,
        },

        currency: {
            type: String,
            default: "INR",
        },

        status: {
            type: String,
            enum: [ "CREATED", "SUCCESS", "FAILED", "REFUNDED"],
            default: "CREATED",
        },

        razorpayOrderId: {
            type: String,
            required: true,
            unique: true,
        },

        razorpayPaymentId: {
            type: String,
            default: null,
        },

        razorpaySignature: {
            type: String,
            default: null,
        },

        razorpayEventId: {
            type: String,
            default: null,
            index: true,
        },
        
    },
    {
        timestamps: true,
    }
);

module.exports = mongoose.model("Payment", paymentSchema);