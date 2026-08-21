const express = require("express");
const dotenv = require("dotenv");

dotenv.config();

const Redis = require("./src/config/redis");

const dns = require("dns");
dns.setServers(["8.8.8.8", "4.4.4.4"]);

const cors = require("cors");
const connectDB = require("./src/config/db");

const app = require("./app");

connectDB();

const PORT = process.env.PORT || 5000;

app.use(cors());

app.listen(PORT, () => {
    console.log(`server is running on ${PORT}`);
});