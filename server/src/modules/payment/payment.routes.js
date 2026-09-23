const express = require("express");

const { createPaymentOrder, verifyPayment } = require("../../controllers/payment.controller")

const router = express.Router();

router.post("/create-order", authenticate, createPaymentOrder);
router.post("/verify", authenticate, verifyPayment)

module.exports = router;