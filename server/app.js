const express = require("express");
const cors = require("cors");

const bookingRoutes = require('./src/modules/booking/booking.routes.js');
const showtimeRoutes = require("./src/modules/catalog/showtime.routes.js");
const paymentRoutes = require("./src/modules/payment/payment.routes.js");
const paymentWebhookRoutes = require("./src/modules/payment/payment.webhook.routes.js");
const authRoutes = require("./src/modules/auth/auth.routes.js");

const app = express();

app.use(cors());

//webhook pehle call hoga qki it needs raw body
app.use("/api/webhooks", paymentWebhookRoutes);

app.use(express.json());

app.use("/api/auth", authRoutes)
app.use("/api/bookings", bookingRoutes);
app.use("/api/showtimes", showtimeRoutes);
app.use("/api/payments", paymentRoutes);

app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    console.error("request processing error", error);

    if (error.type === "entity.parse.failed") {
        return res.status(400).json({ message: "invalid JSON request body" });
    }
    if (error.type === "entity.too.large") {
        return res.status(413).json({ message: "request body is too large" });
    }
    return res.status(500).json({ message: "internal server error" });
});

module.exports = app;
