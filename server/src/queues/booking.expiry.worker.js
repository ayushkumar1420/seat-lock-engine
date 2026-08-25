const Booking = require("../modules/booking/booking.model");
const redis = require("../config/redis");

const checkExpiredBookings = async () => {
    try {
        const  now = new Date();

        const expiredBookings = await Booking.find({
            status: "PENDING",
            expiresAt: { $lte: now },
        });

        if ( expiredBookings.length === 0){
            return 0;
        }

        for (const booking of expiredBookings){
            const seatKeys = booking.seats.map(
                (seat) => `seat: ${booking.showtimeId}:${seat}`
            );

            //if the booking user exists then it only delete redis locks which belogs to that
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
                booking.userId
            );

            booking.status = "EXPIRED";

            await booking.save();

            console.log(
                `Booking ${booking._id} expired. seats released.`
            );   
        }
    } catch (error) {
        console.error("Booking expiry worker error:", error);
    }
};

const startBookingExpiryWorker = () => {
    console.log("booking expiry worker started");

    // hrr 10 second pe check krne k liye
    setInterval(checkExpiredBookings, 10 * 1000);
};

module.exports = {
    startBookingExpiryWorker
}