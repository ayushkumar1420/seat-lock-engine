const mongoose = require("mongoose")

const showtimeSchema = new mongoose.Schema({
    
    movieId: {
        type: mongoose.Schema.Types.ObjectId,
        required: true,
    },

    screenId: {
        type: mongoose.Schema.Types.ObjectId,
        required: true,
    },

    startTime: {
        type: Date,
        required: true,
    },

    ticketPrice: {
        type: Number,
        required: true,
    },

}, {
    timestamps: true,
});

module.exports = mongoose.model("Showtime", showtimeSchema)