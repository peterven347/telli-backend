const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const UserModel = require("./user")

const mainSchema = new Schema({
    domain: { type: String, required: true },
    creator: { type: String, required: true }, // { type: mongoose.Schema.Types.ObjectId, ref: UserModel } instead
    delegates: [{
        // _id: false,
        _id: { type: mongoose.Schema.Types.ObjectId, ref: UserModel },
        name: String,
        role: { type: String, enum: ["member", "admin"], default: "member" }
    }],
    logo: { type: String },
    public: { type: Boolean, default: true },
    sectors: [{
        _id: false,
        title: String,
        issues: [{
            // _id: false,
            date_created: { type: Date, default: Date.now() },
            note: String,
            pictures: [
                {type: String, default: []}
            ],
            resolved_votes: [
                {type: String, default: []},
            ],
            resolved: { type: Boolean, default: false },
            date_resolved: Date,
        }]
    }]
},
{timestamps: true});

const Domain = mongoose.model('Domain', mainSchema)
module.exports = Domain;