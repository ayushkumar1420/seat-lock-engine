const mongoose = require("mongoose");
const dotenv = require("dotenv");

const Seat = require("../modules/seat/seat.model");

dotenv.config();

const showtimeId = process.argv[2];

if (!showtimeId){
    console.error("please provide a showtimeId");
    process.exit(1);
}

const seats = [
    "A1", "A2", "A3", "A4",
    "B1", "B2", "B3", "B4",
    "C1", "C2", "C3", "C4"
];

const createSeats = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);

        console.log("mongodb connected");
        
        const seatDocuments = seats.map((seatNumber) => ({
            showtimeId,
            seatNumber,
            status: "AVAILABLE",
        }));

        await Seat.insertMany(seatDocuments, {
            ordered: false,
        });
        
        console.log(`seats created for showtime ${showtimeId}`);
        
    } catch (error) {
        console.error("seat creation error", error);
    } finally {
        await mongoose.disconnect();
    }
};

createSeats();