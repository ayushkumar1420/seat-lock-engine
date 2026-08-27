const express = require("express");

const bookingRoutes = require('./src/modules/booking/booking.routes.js');
const showtimeRoutes = require(".src/modules/catalog/showtime.routes");

const app = express();

app.use(express.json());

app.use("/api/bookings", bookingRoutes);
app.use("/api/showtimes", showtimeRoutes);

module.exports = app;
