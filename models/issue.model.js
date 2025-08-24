const mongoose = require('mongoose')
const Schema = mongoose.Schema
const User = require("../models/user.model")

const issueSchema = new Schema({
    sector_id: {
        type: Schema.Types.ObjectId,
        ref: "Sector",
        required: true
    },
    creator_id: {
        type: Schema.Types.ObjectId,
        ref: "User",
        required: true
    },
    note: {
        type: String,
        required: true
    },
    pictures: [
        {
            type: String,
            default: []
        }
    ],
    voters_count: {
        type: Number,
        default: 0,
        min: 0
    },
    resolved: {
        type: Number,
        default: 0
    }
})

issueSchema.pre("save", async function (next) {
    if (this.isModified("voters_count")) {
        // const sector = await mongoose.model("Sector").findById(this.sectorId)
        // if (sector) {
        //     this.resolved = sector.delegates.length / this.voters_count
        // }
        const user = User.find({ sectors: this.sector_id }).select("_id")
        if (user) {
            console.log(user)
            this.resolved = (await user).length / this.voters_count
        }
    }
    next()
})

const IssueModel = mongoose.model("Issue", issueSchema)
module.exports = IssueModel