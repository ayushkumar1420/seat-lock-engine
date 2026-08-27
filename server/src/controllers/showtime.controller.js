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

        //automatically generate seat inventory
        await createSeatInventory(
            showtime._id,
            session
        );

        await session.commitTransaction();

        return res.status(201).json({
            message: "showtime created successfully",
            showtimeId: showtime._id,
        });

    } catch (error) {
        if (session.inTransaction()) {
            await session.abortTransaction();
        }

        console.error("showtime creation error", error);
        
        return res.status(500).json({
            message: "failed to create showtime",
        });

    } finally {
        await session.endSession();
    }
}

module.exports = { createShowtime, }