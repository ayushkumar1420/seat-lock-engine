const redis = require("../config/redis");
const Booking = require("../modules/booking/booking.model");
const Seat = require("../modules/seat/seat.model");
const Showtime = require("../modules/catalog/showtime.model");
const mongoose = require("mongoose");


const LOCK_DURATION = 10 * 60;

const lockSeats = async (req, res)  => {
    try {
        const { showtimeId, seats } = req.body;

        //userid comes from verified JWT
        const userId = req.user.userId;
        const bookingId = new mongoose.Types.ObjectId();

        if(!showtimeId || !userId || !Array.isArray(seats) || seats.length === 0 ){
            return res.status(400).json({
                message: "all fields are required"
            });
        }

        //get real ticket price form database
        const showtime = await Showtime.findById(showtimeId);

        if(!showtime) {
            return res.status(404).json({
                message: "showtime not found"
            })
        }

        // Remove duplicate seat numbers from the request
        const uniqueSeats = [...new Set(seats)];

        if (uniqueSeats.length !== seats.length) {
            return res.status(400).json({
                message: "Duplicate seats are not allowed",
            });
        }

        const totalAmount = showtime.ticketPrice * seats.length;

        // Check that all requested seats exist
        const existingSeats = await Seat.find({
            showtimeId,
            seatNumber: { $in: seats },
        });

        if (existingSeats.length !== seats.length) {
            return res.status(400).json({
                message: "One or more requested seats do not exist for this showtime",
            });
        }

        //permanent booking check krne k liye 
        const bookedSeats = existingSeats.filter(
            (seat) => seat.status === "BOOKED"
        ); 

        if (bookedSeats.length > 0) {
            return res.status(409).json({
                message: "One or more seats are permanently booked",
                seats: bookedSeats.map((seat) => seat.seatNumber),
            });
        }

        const seatKeys = seats.map(
            (seat) =>  `seats:${showtimeId}:${seat}`
        );

        //lua script - ek scripting language hai jo ki use hota h complex running,
        //atomic operation directly on the server to reduce network latency and,
        //ensure data consistency(typo for redis).
        //atomic operation - ek aisa action that executes as a single, indivisual unit.(it follows "all-or-nothing" rule)

        //luascript: 
        //1. check whether any seats is already locked
        //2. if yes return 0
        //3. if no lock all the seats
        //4. setting expiration on all seats
        //5. return 1

        //atomically check and lock all requested seats
        const lockScript = ` 
        for _, key in ipairs(KEYS) do 
        if redis.call("EXISTS", key) == 1 then
        return 0
        end
        end
        
        for _, key in ipairs(KEYS) do
        redis.call("SET", key, ARGV[1], "EX", ARGV[2])
        end
        
        return 1
        `;

        //only removes locks owned by this user
        const unlockScript = `
        for _, key in ipairs(KEYS) do
        if redis.call("GET", key) == ARGV[1] then
        redis.call("DEL", key)
        end
        end
        return 1
        `;

        const result = await redis.eval( lockScript, seatKeys.length, ...seatKeys, bookingId.toString(), LOCK_DURATION);

        if (result === 0) {
            return res.status(409).json({
                message: "seats are already locked",
            });
        }

        const expiresAt = new Date( Date.now() + LOCK_DURATION * 1000 );

        // to create a pending bookings using trycatch
        let booking;
        try {
            booking = await Booking.create({
                _id: bookingId,
                showtimeId,
                userId,
                seats,
                totalAmount,
                status: "PENDING",
                expiresAt,
            });

        } catch (error) {
            console.error("mongodb booking creation failed", error);
        
            //release redis lock if mongodb booking fails
            await redis.eval(
                unlockScript,
                seatKeys.length,
                ...seatKeys,
                bookingId.toString()
            );

            return res.status(500).json({
                message: "booking creation failed, seat locks released",
            });
        }

        return res.status(201).json({
            message: "seats locked",
            bookingId: booking._id,
            seats,
            totalAmount,
            expiresAt,
        });

    } catch (error) {
        console.error("seat lock error:", error);
        
        return res.status(500).json({
            message: "failed to lock the seat",
        });
    }
}

const getBookingStatus = async (req, res) => {
    try {
        const booking = await Booking.findOne({
            _id: req.params.bookingId,
            userId: req.user.userId,
        });

        if(!booking) {
            return res.status(404).json({
                message: "booking not found",
            });
        }

        return res.status(200).json({
            bookingId: booking._id,
            status: booking.status,
            seats: booking.seats,
        });
    } catch (error) {
        console.log("booking status error", error);
        return res.status(500).json({
            message: "failed to get booking status",
        });
    }
};

module.exports = { lockSeats, getBookingStatus, }