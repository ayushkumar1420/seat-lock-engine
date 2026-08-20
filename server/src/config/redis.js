const Redis = require('ioredis');

const redis = new Redis(process.env.REDIS_URL || "redis://localhost:6379");

redis.on("connect", () => {
    console.log("redis connected");
});

redis.on("error", (error) => {
    console.log("redis connection failed", error);
});

module.exports = redis;