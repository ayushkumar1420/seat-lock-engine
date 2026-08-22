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

        const lockSeats = ` 
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

        const result = await redis.eval( lockScript, seatKeys.length, ...seatKeys, userId, LOCK_DURATION);

        if (result === 0) {
            return res.status(409).json({
                message: "seats are already locked",
            });
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