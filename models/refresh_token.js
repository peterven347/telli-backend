const mongoose = require("mongoose")
const Schema = mongoose.Schema

const RefreshTokenSchema = new Schema({
    refreshToken: { type: String, required: true },
})

const RefreshToken = mongoose.model("RefreshToken", RefreshTokenSchema)
module.exports = RefreshToken;