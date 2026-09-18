const express = require("express");

const { createShowtime, getShowtimeSeats, getShowtimes } = require("../../controllers/showtime.controller");

const router = express.Router();

router.get("/:showtimeId/seats", getShowtimeSeats)
router.post("/", createShowtime);
router.get("/", getShowtimes);

module.exports = router;