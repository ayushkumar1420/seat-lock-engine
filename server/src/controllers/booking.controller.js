const redis = require("../config/redis");

const Booking = require("../modules/booking/booking.model");

const LOCK_DURATION = 10 * 60;

const lockSeats = async (req, res)  => {
    try {
        const { showtimeId, userId, seats, totalAmount } = req.body;

        if(!showtimeId || !userId || !seats || !totalAmount ){
            return res.status(400).json({
                message: "all fields are required"
            });
        }

        const lockKeys = seats.map(
            (seat) =>  `seats:${showtimeId}:${seat}`
        );

        //check krne k liye seat already lock h ya nhi
        const existingLocks = await redis.mget(lockKeys);

        const alreadyLocked = existingLocks.some((lock) => lock !== null);

        if(alreadyLocked){
            return res.status(409).json({
                message: "seats are already locked",
            })
        }

        // to lock all seats
        for (const key of lockKeys){
            await redis.set(key, userId, "EX", LOCK_DURATION);
        }

        const expiresAt = new Date( Date.now() + LOCK_DURATION * 1000 );

        // to create a pending bookings
        const booking = await Booking.create({
            showtimeId,
            userId,
            seats,
            totalAmount,
            status: "PENDING",
            expiresAt,
        });

        return res.status(201).json({
            message: "seats locked",
            bookingId: booking._id,
            seats,
            expiresAt,
        });

    } catch (error) {
        console.error("seat lock error:", error);
        
        return res.status(500).json({
            message: "failed to lock the seat",
        });
    }
}

module.exports = { lockSeats, }