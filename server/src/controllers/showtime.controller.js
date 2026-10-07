const mongoose = require("mongoose");

const Showtime = require("../modules/catalog/showtime.model");
const createSeatInventory = require("../utils/createSeatInventory");
const Seat = require("../modules/seat/seat.model");
const redis = require("../config/redis")

const createShowtime = async (req, res) => {
    let session;

    try {
        const {
            movieId,
            screenId,
            startTime,
            ticketPrice,
        } = req.body || {};

        if ( !movieId || !screenId || !startTime || ticketPrice === undefined )
        {
            return res.status(400).json({
                message: "all showtime fields are required",
            });
        }

        if (typeof movieId !== "string" || !mongoose.isObjectIdOrHexString(movieId) ||
            typeof screenId !== "string" || !mongoose.isObjectIdOrHexString(screenId)) {
            return res.status(400).json({
                message: "valid movieId and screenId are required",
            });
        }

        if (typeof ticketPrice !== "number" || !Number.isFinite(ticketPrice) || ticketPrice <= 0) {
            return res.status(400).json({
                message: "ticketPrice must be a positive number",
            });
        }

        const parsedStartTime = typeof startTime === "string" ? new Date(startTime) : null;
        if (!parsedStartTime || Number.isNaN(parsedStartTime.getTime()) || parsedStartTime <= new Date()) {
            return res.status(400).json({
                message: "startTime must be a valid future date",
            });
        }

        session = await mongoose.startSession();
        session.startTransaction();

        //create showtime
        const [showtime] = await Showtime.create(
            [
                {
                    movieId, screenId, startTime: parsedStartTime, ticketPrice,
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
        if (session?.inTransaction()) {
            await session.abortTransaction();
        }

        console.error("showtime creation error", error);
        
        return res.status(500).json({
            message: "failed to create showtime",
        });

    } finally {
        if (session) await session.endSession();
    }
}

const getShowtimeSeats = async (req, res) => {
    try {
        const { showtimeId } = req.params;

        if (!mongoose.isObjectIdOrHexString(showtimeId)) {
            return res.status(400).json({
                message: "a valid showtimeId is required",
            });
        }

        const showtime = await Showtime.findById(showtimeId);

        if(!showtime) {
            return res.status(404).json({
                message: "showtime not found",
            });
        }

        const seats = await Seat.find({showtimeId})
        .select("seatNumber status")
        .sort({seatNumber: 1})
        .lean();
        
        //check temporary redis locks for every seat
        const lockValues = await Promise.all(
            seats.map((seat) => redis.get(`seats:${showtime._id}:${seat.seatNumber}`))
        );

        const seatsWithStatus = seats.map((seat, index) => ({
            ...seat,
            status: seat.status === "BOOKED" ? "BOOKED" : lockValues[index] ? "LOCKED" : "AVAILABLE",
        }));


        return res.status(200).json({
            showtimeId: showtime._id,
            startTime: showtime.startTime,
            ticketPrice: showtime.ticketPrice,
            seats: seatsWithStatus,
        });

    } catch (error) {
        console.error("Get showtime seats error:",error);

        return res.status(500).json({
            message: "Failed to fetch seats",
        });
    }
}

const getShowtimes = async (req, res) => {
    try {
        const showtimes = await Showtime.find({ startTime: { $gt: new Date() } })
        .sort({ startTime: 1 });

        return res.status(200).json(showtimes);
    } catch (error) {
        console.log("get showtimes error", error);
        return res.status(500).json({
            message: "failed to fetch showtimes",
        });
    }
}

module.exports = { createShowtime, getShowtimeSeats, getShowtimes }
