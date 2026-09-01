const express = require("express");

const { razorpayWebhook } = require("../../controllers/payment.webhook.controller");

const router = express.Router();

router.post("/razorpay", express.raw({ type: "application/josn" }),
    razorpayWebhook
);

module.exports = router;