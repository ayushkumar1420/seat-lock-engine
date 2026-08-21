const express = require("express");
const { lockSeats } = require("../../controllers/booking.controller");

const router = express.Router();

router.post("/lock", lockSeats);

module.exports = router;