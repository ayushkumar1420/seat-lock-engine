const express = require("express");
const { lockSeats, confirmBooking, getBookingStatus } = require("../../controllers/booking.controller");
const authenticate = require("../../middleware/auth.middleware");

const router = express.Router();

router.post("/lock", authenticate, lockSeats);
router.post("/confirm", confirmBooking);
router.get("/:bookingId/status", getBookingStatus);

module.exports = router;