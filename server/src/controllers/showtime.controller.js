const mongoose = require("mongoose");

const Showtime = require("../modules/catalog/showtime.model");
const createSeatInventory = require("../utils/createSeatInventory");

const createShowtime = async (req, res) => {
    const session = await mongoose.startSession();

    try {
        const {
            movieId,
            screenId,
            startTime,
            ticketPrice,
        } = req.body

        if ( !movieId || !screenId || !startTime || ticketPrice === undefined )
        {
            return res.status(400).json({
                message: "all showtime fields are required",
            });
        }

        session.startTransaction();

        //create showtime
        const [showtime] = await Showtime.create(
            [
                {
                    movieId, screenId, startTime, ticketPrice,
                },
            ],
            {
                session,
            }
        );

        
    } catch (error) {
        
    }
}

module.exports = { createShowtime, }