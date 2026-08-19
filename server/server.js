const express = require('express');
const dns=require('dns')
dns.setServers(['8.8.8.8','8.8.4.4'])
const dotenv = require("dotenv")
dotenv.config()
const cors = require("cors")
const connectDB = require("./src/config/db")
connectDB();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

app.listen(PORT, (req, res) => {
    console.log(`server is running on ${PORT}`)
})
