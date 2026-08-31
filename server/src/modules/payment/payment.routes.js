const express = require("express");

const { createPaymentOrder } = require("../../controllers/payment.controller")

const router = express.Router();

router.post("/create-order", createPaymentOrder);

module.exports = router;