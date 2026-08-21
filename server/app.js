const express = require("express");

const bookingRoutes = require('./src/modules/booking/booking.routes.js');

const app = express();

app.use(express.json());

app.use("/api/bookings", bookingRoutes);

module.exports = app;
