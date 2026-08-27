const Seat = require("../modules/seat/seat.model");

const DEFAULT_SEATS = [
    "A1", "A2", "A3", "A4",
    "B1", "B2", "B3", "B4",
    "C1", "C2", "C3", "C4"
];

const createSeatInventory = async (showtimeId, session = null) => {
    const operations = DEFAULT_SEATS.map((seatNumber) => ({
        updateOne: {
            filter: {
                showtimeId,
                seatNumber,
            },

            update: {
                $setOnInsert: {
                    showtimeId,
                    seatNumber,
                    status: "AVAILABLE",
                    bookingId: null,
                },
            },

            upsert: true,
        },
    }));

    const options = {};
    if(session){
        options.session = session;
    }

    await Seat.buildWrite(operations, options);
};

module.exports = createSeatInventory;