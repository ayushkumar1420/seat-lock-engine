const express = require("express");

const { createShowtime, getShowtimeSeats } = require("../../controllers/showtime.controller");

const router = express.Router();

router.get("/:showtimeId/seats", getShowtimeSeats)
router.post("/", createShowtime);

module.exports = router;