const express = require("express");
const { lockSeats, getBookingStatus } = require("../../controllers/booking.controller");
const authenticate = require("../../middleware/auth.middleware");
const { bookingLimiter } = require("../../middleware/rateLimit.middleware")

const router = express.Router();

router.post("/lock", authenticate, bookingLimiter, lockSeats);
router.get("/:bookingId/status", authenticate, getBookingStatus);

module.exports = router;