const Booking = requrie("../modules/booking/booking.model");
const redis = requrie("../config/redis");

const checkExpiredBooking = async () => {
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

            
        }
    } catch (error) {
        
    }
}