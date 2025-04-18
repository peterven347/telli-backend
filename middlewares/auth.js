require('dotenv').config()
const jwt = require("jsonwebtoken")

const revoked_access_tokens = [] //will take up memory over time

function auth(req, res, next) {
    try {
        const authHeader = req.get("Authorization")
        if (!authHeader) {
            req.auth = { message: "no auth"}
        } else {
            const token = authHeader.split(" ")[1]
            // console.log(authHeader)
            const revoked = authHeader.split(" ")[2] === "exp"
            if (revoked_access_tokens.includes(token)) {
                req.auth = { exp: true }
            } else {
                jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, user) => {
                    if (err) {
                        if (err.message.name === "TokenExpiredError"){
                            return req.auth = { exp: true }
                        }
                        return req.auth = { exp: "invalid token" }
                    } else if (revoked) {
                        revoked_access_tokens.push(token)
                        return req.auth = { exp: true }
                    }
                    else {
                        req.auth = { email: user.email }
                    }
                })
            }
        }
        next()
    } catch (err) {
        req.auth = { message: "Authentication error!" }
    }
}

module.exports = {
    auth
}