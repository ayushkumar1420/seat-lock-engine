const mongoose = require("mongoose");

const seatSchema = new mongoose.Schema(
    {
        showtimeId: {
            type: mongoose.Schema.Types.ObjectId,
            required: true,
            ref: "Showtime"
        },

        seatNumber: {
            type: String,
            required: true,
        },

        status: {
            type: String,
            required: ["AVAILABLE", "BOOKED"],
            default: "AVAILABLE",
        },

        bookingId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Booking",
            default: null,
        },
    },

    {
        timestamps: true,
    },
);

// to make it one seat available only once for a particular showtime
seatSchema.index(
    { showtimeId: 1, seatNumber: 1 },
    { unique: true }
);


module.exports = mongoose.model("Seat", seatSchema)