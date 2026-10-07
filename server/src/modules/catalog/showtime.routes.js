const express = require("express");

const { createShowtime, getShowtimeSeats, getShowtimes } = require("../../controllers/showtime.controller");
const authenticate = require("../../middleware/auth.middleware");

const router = express.Router();

router.get("/:showtimeId/seats", getShowtimeSeats)
router.post("/", authenticate, createShowtime);
router.get("/", getShowtimes);

module.exports = router;
