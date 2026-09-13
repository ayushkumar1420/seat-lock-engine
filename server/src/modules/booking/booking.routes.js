const express = require("express");
const { lockSeats, confirmBooking, getBookingStatus } = require("../../controllers/booking.controller");

const router = express.Router();

router.post("/lock", lockSeats);
router.post("/confirm", confirmBooking);
router.get("/:bookingId/status", getBookingStatus);

module.exports = router;