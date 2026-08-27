const mongoose = require("mongoose");
const redis = require("../config/redis");
const Booking = require("../modules/booking/booking.model");
const Seat = require("../modules/seat/seat.model");

const LOCK_DURATION = 10 * 60;

const lockSeats = async (req, res)  => {
    try {
        const { showtimeId, userId, seats, totalAmount } = req.body;

        if(!showtimeId || !userId || !Array.isArray(seats) || !seats || seats.length === 0 || totalAmount === undefined ){
            return res.status(400).json({
                message: "all fields are required"
            });
        }

        // const alreadyBooked = await Booking.findOne({
        //     showtimeId,
        //     seats: { $in: seats },
        //     status: "SUCCESS",
        // });
        // now the check is removed at this place we use seat collection


        // Remove duplicate seat numbers from the request
        const uniqueSeats = [...new Set(seats)];

        if (uniqueSeats.length !== seats.length) {
            return res.status(400).json({
                message: "Duplicate seats are not allowed",
            });
        }

        // Check that all requested seats exist
        const existingSeats = await Seat.find({
            showtimeId,
            seatNumber: { $in: seats },
        });

        if (existingSeats.length !== seats.length) {
            return res.status(400).json({
                message:
                    "One or more requested seats do not exist for this showtime",
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

        // if (alreadyBooked) {
        //     return res.status(409).json({
        //         message: "seats are already booked"
        //     });
        // }


        const seatKeys = seats.map(
            (seat) =>  `seats:${showtimeId}:${seat}`
        );

        
        //lua script - ek scripting language hai jo ki use hota h complex running,
        //atomic operation directly on the server tp reduce network latency and,
        //ensure data consistency(typo for redis).
        //atomic operation - ek aisa action that executes as a single, indivisual unit.(it follows "all-or-nothing" rule)

        //luascript: 
        //1. check whether any seats is already locked
        //2. if yes return 0
        //3. if no lock all the seats
        //4. setting expiration on all seats
        //5. return 1

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

        const unlockScript = `
        for _, key in ipairs(KEYS) do
        if redis.call("GET", key) == ARGV[1] then
        redis.call("DEL", key)
        end
        end
        return 1
        `;

        const result = await redis.eval( lockScript, seatKeys.length, ...seatKeys, userId, LOCK_DURATION);

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
                showtimeId,
                userId,
                seats,
                totalAmount,
                status: "PENDING",
                expiresAt,
            });

        } catch (error) {
            console.error("mongodb booking creation failed", error);
        
            await redis.eval(
                unlockScript,
                seatKeys.length,
                ...seatKeys,
                userId
            );

            return res.status(500).json({
                message: "booking creation failed, seat locks released",
            });
        }
        

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


const confirmBooking = async (req, res) => {
    const session = await mongoose.startSession();

    try {
        const { bookingId, userId } = req.body;

        if (!bookingId || !userId) {
            return res.status(400).json({
                message: "bookingId and userId are required",
            });
        }

        // Find pending booking
        const booking = await Booking.findOne({
            _id: bookingId,
            userId,
            status: "PENDING",
        });

        if (!booking) {
            return res.status(404).json({
                message: "Pending booking not found",
            });
        }

        // Check booking expiry
        if (booking.expiresAt <= new Date()) {
            booking.status = "EXPIRED";
            await booking.save();

            return res.status(409).json({
                message: "Booking has expired",
            });
        }

        const seatKeys = booking.seats.map(
            (seat) => `seats:${booking.showtimeId}:${seat}`
        );

        // Verify that this user still owns every Redis lock
        const verifyLocksScript = `
            for _, key in ipairs(KEYS) do
                if redis.call("GET", key) ~= ARGV[1] then
                    return 0
                end
            end

            return 1
        `;

        const ownsLocks = await redis.eval(
            verifyLocksScript,
            seatKeys.length,
            ...seatKeys,
            userId
        );

        if (ownsLocks === 0) {
            return res.status(409).json({
                message: "Seat lock has expired or is no longer owned by this user",
            });
        }

        // Start MongoDB transaction
        session.startTransaction();

        for (const seatNumber of booking.seats) {
            const seat = await Seat.findOneAndUpdate(
                {
                    showtimeId: booking.showtimeId,
                    seatNumber,
                    status: "AVAILABLE",
                },
                {
                    $set: {
                        status: "BOOKED",
                        bookingId: booking._id,
                    },
                },
                {
                    new: true,
                    session,
                }
            );

            if (!seat) {
                throw new Error(
                    `Seat ${seatNumber} is already booked or does not exist`
                );
            }
        }

        // Booking becomes successful in the SAME transaction
        booking.status = "SUCCESS";

        await booking.save({ session });

        await session.commitTransaction();

        // Only after MongoDB commit succeeds,
        // remove temporary Redis locks
        const unlockScript = `
            for _, key in ipairs(KEYS) do
                if redis.call("GET", key) == ARGV[1] then
                    redis.call("DEL", key)
                end
            end

            return 1
        `;

        await redis.eval(
            unlockScript,
            seatKeys.length,
            ...seatKeys,
            userId
        );

        return res.status(200).json({
            message: "Booking confirmed successfully",
            bookingId: booking._id,
            status: "SUCCESS",
            seats: booking.seats,
        });

    } catch (error) {

        if (session.inTransaction()) {
            await session.abortTransaction();
        }

        console.error("Booking confirmation error:", error);

        return res.status(409).json({
            message: error.message || "Failed to confirm booking",
        });

    } finally {
        await session.endSession();
    }
};

module.exports = { lockSeats, confirmBooking }