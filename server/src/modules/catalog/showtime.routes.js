const express = require("express");

const { createShowtime } = require("../../controllers/showtime.controller");

const router = express.Router();

router.post("/", createShowtime);

module.exports = router;