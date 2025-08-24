const mongoose = require("mongoose")
const Schema = mongoose.Schema

const UserSchema = new Schema({
    first_name: {
        type: String,
        required: true
    },
    last_name: {
        type: String,
        required: true
    },
    email: {
        type: String,
        required: true,
        match: [/.+@.+\..+/, "Please fill a valid email address"],
        lowercase: true
    },
    phone_number: {
        type: String,
        required: true
    },
    password: {
        type: String,
        required: true
    },
    // country_code: { type: String, required: true },
    fcmTokens: [{ type: String }],
    issues_voted: [{ type: Schema.Types.ObjectId, ref: "Issue" }],
    sectors: [{ type: Schema.Types.ObjectId, ref: "Sector" }]
})

const userModel = mongoose.model("User", UserSchema)
module.exports = userModel;