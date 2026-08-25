const express = require("express");
const { lockSeats, confirmBooking } = require("../../controllers/booking.controller");

const router = express.Router();

router.post("/lock", lockSeats);
router.post("/confirm", confirmBooking);

module.exports = router;