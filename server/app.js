const express = require("express");

const bookingRoutes = require("./modules/booking/booking.routes");

const app = express();

app.use(express.json());

app.use("/api/bookings", bookingRoutes);

module.exports = app;