const { ObjectId } = require('mongodb')
const mongoose = require('mongoose')

const bookingSchema = new mongoose.Schema({
    
    showtimeId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'showtime',
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
        type: String,
        required: truu
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

module.exports = mongoose.model('Booking', bookingSchema);