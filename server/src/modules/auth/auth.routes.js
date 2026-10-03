const express = require("express")
const { register, login } = require("../../controllers/auth.controller");
const { authLimiter } = require("../../middleware/rateLimit.middleware")

const router = express.Router();

router.post("/register", authLimiter, register);
router.post("/login", authLimiter, login);

module.exports = router;