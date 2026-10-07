const express = require("express");
const dotenv = require("dotenv");

dotenv.config();

const Redis = require("./src/config/redis");

const dns = require("dns");
dns.setServers(["8.8.8.8", "4.4.4.4"]);

const connectDB = require("./src/config/db");

const app = require("./app");
const Payment = require("./src/modules/payment/payment.model");
const { startBookingExpiryWorker } = require("./src/queues/booking.expiry.worker")


const PORT = process.env.PORT || 5000

const startServer = async () => {
    await connectDB();
    // Do not accept orders until the payment uniqueness indexes are ready.
    await Payment.init();
    startBookingExpiryWorker();

    app.listen(PORT, () => {
        console.log(`server is running on ${PORT}`);
    });
};

startServer().catch((error) => {
    console.error("server startup failed", error);
    process.exit(1);
});
