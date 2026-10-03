const rateLimit = require("express-rate-limit")

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 3,
    message: { message: "too many attempts, please try again later",}
});

const bookingLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: 10,
    message: { message: "too many attempts, please try again later",}
});

const paymentLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: 10,
    message: { message: "too many attempts, please try again later",}
});

module.exports = { authLimiter, bookingLimiter, paymentLimiter };

