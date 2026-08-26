const redis = require("../config/redis");
const Booking = require("../modules/booking/booking.model");

const LOCK_DURATION = 120;

const lockSeats = async (req, res)  => {
    try {
        const { showtimeId, userId, seats, totalAmount } = req.body;

        if(!showtimeId || !userId || !seats || seats.length === 0 || totalAmount === undefined ){
            return res.status(400).json({
                message: "all fields are required"
            });
        }

        const alreadyBooked = await Booking.findOne({
            showtimeId,
            seats: { $in: seats },
            status: "SUCCESS",
        });

        if (alreadyBooked) {
            return res.status(409).json({
                message: "seats are already booked"
            });
        }

        
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
    try {
        const { bookingId, userId } = req.body

        if( !bookingId || !userId ){
            return res.status(400).json({
                message: "bookingId and userId are required",
            });
        }

        // to find the pending bookings
        const booking = await Booking.findOne({
            _id: bookingId,
            userId,
            status: "PENDING",
        });

        if(!booking) {
            return res.status(404).json({
                message: "pending booking not found",
            });
        }

        // to check that booking is expired or not
        if(booking.expiresAt <= new Date()){
            booking.status = "EXPIRED";
            await booking.save();

            return res.status(400).json({
                message: "booking has expired"
            });
        }

        booking.status = "SUCCESS";
        await booking.save();

        // now remove the temporary redis locks
        const seatKeys = booking.seats.map(
            (seat) => `seats:${booking.showtimeId}:${seat}`
        );

        const unlockScript = `
            for _, key in ipairs(KEYS) do
            if redis.call("GET", key) == ARGV[1] then
            redis.call("DEL", key)
            end
            end
            return 1`;

        await redis.eval(
            unlockScript,
            seatKeys.length,
            ...seatKeys,
            userId
        );

        return res.status(200).json({
            message: "Booking confirmed successfully",
            bookingId: booking._id,
            status: booking.status,
            seats: booking.seats,
        });

    } catch (error) {
        console.error((" booking confirmation error:", error));
        
        return res.status(500).json({
            message: "failed to confirm booking",
        });
    }
};

module.exports = { lockSeats, confirmBooking }