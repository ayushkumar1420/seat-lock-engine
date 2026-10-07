const mongoose = require("mongoose");

const bookingSchema = new mongoose.Schema({
    
    showtimeId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "showtime",
        required: true
    },

    userId: {
        type: String,
        required: true
    },

    seats: [{
        type: String,
        required: true
    }],

    totalAmount: {
        type: Number,
        required: true
    },

    paymentOrderPending: {
        type: Boolean,
        default: false
    },

    status: {
        type: String,
        enum: ['PENDING', 'EXPIRED','FAILED','SUCCESS'],
        required: true
    },

    expiresAt: {
        type: Date,
        required: true
    }
},
{
    timestamps: true
});

bookingSchema.index({ status: 1, expiresAt: 1 });

module.exports = mongoose.model('Booking', bookingSchema);
