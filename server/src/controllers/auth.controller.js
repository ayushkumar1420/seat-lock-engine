const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const User = require("../modules/auth/user.model");

// register
const register = async (req, res) => {
    try {
        const { name, email, password } = req.body;

        if( !name || !email || !password ) {
            return res.status(400).json({
                message: "all fields are required",
            })
        }

        const existingUser = await User.findOne({ email });
        if(existingUser) {
            return res.status(409).json({
                message: "email already exist",
            });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const user = await User.create({
            name, email, password: hashedPassword,
        });

        return res.status(201).json({
            message: "user registered successfully",
            userId: user._id,
        });
    } catch (error) {
        console.log("registered error", error);
        return res.status(500).json({
            message: "Registration failed",
        });
    }
};

//login
 const login = async (req, res) => {
    try {
        const { email, password } = req.body;
        if ( !email || !password ) {
            return res.status(400).json({
                message: "email and password are required",
            });
        }

        const user = await User.findOne({ email });
        if(!user){
            return res.status(401).json({
                message: "invalid email or password",
            });
        }

        const passwordMatch = await bcrypt.compare( password, user.password );
        if(!passwordMatch){
            return res.status(401).json({
                message: "invalid email or password",
            });
        }

        const token = jwt.sign(
            { userId: user._id },
            process.env.JWT_SECRET,
            { expiresIn: "1h" }
        );

        return res.status(200).json({
            message: "login successful",
            token, 
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
            },
        });
    } catch (error) {
        console.log("login error", error);
        return res.status(500).json({
            message: "login failed",
        });
    }
 };

 module.exports = { register, login };