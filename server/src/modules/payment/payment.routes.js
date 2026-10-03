const express = require("express");
const { createPaymentOrder, verifyPayment } = require("../../controllers/payment.controller")
const authenticate = require("../../middleware/auth.middleware")
const { paymentLimiter } = require("../../middleware/rateLimit.middleware");

const router = express.Router();

router.post("/create-order", authenticate, paymentLimiter, createPaymentOrder);
router.post("/verify", authenticate, verifyPayment)

module.exports = router;