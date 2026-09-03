const express = require("express");
const cors = require("cors");

const bookingRoutes = require('./src/modules/booking/booking.routes.js');
const showtimeRoutes = require("./src/modules/catalog/showtime.routes.js");
const paymentRoutes = require("./src/modules/payment/payment.routes.js");
const paymentWebhookRoutes = require("./src/modules/payment/payment.webhook.routes.js");

const app = express();

app.use(cors());

//webhook pehle call hoga qki it needs raw body
app.use("/api/webhooks", paymentWebhookRoutes);

app.use(express.json());

app.use("/api/bookings", bookingRoutes);
app.use("/api/showtimes", showtimeRoutes);
app.use("/api/payments", paymentRoutes);

module.exports = app;
