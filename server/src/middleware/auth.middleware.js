const jwt = require("jsonwebtoken");

const authenticate = (req, res, next) => {
    const authHeader = req.headers.authorization;

    if(!authHeader || !authHeader.startsWith("Bearer")) {
        return res.status(401).json({
            message: "authentication required",
        });
    }

    const token = authHeader.split(" ")[1];

    try {
        const decoded = jwt.verify( token, process.env.JWT_SECRET );
        req.body = decoded;
        next();
    } catch (error) {
        return res.status(401).json({
            message: "invalid or expired token",
        });
    }
};

module.exports = authenticate;