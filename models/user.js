const mongoose = require("mongoose")
const Schema = mongoose.Schema

const UserSchema = new Schema({
    first_name: { type: String, required: true },
    last_name: { type: String, required: true },
    email: { type: String, required: true },
    phone_number: { type: String, required: true },
    password: { type: String, required: true },
    // country_code: { type: String, required: true },
    domains: [{ type: String}] // shoul link to domainModel
})

const userModel = mongoose.model("User", UserSchema)
module.exports = userModel;