const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const domainSchema = new Schema({
    domain: {
        type: String,
        required: true
    },
    creator_id: {
        type: Schema.Types.ObjectId,
        required: true,
        ref: "User",
        index: true
    },
    logo: {
        type: String,
        default: ""
    }
},
{timestamps: true});

// domainSchema.virtual("sectors", {
//     ref: "Sector",
//     localField: "_id",
//     foreignField: "domain_id"
// })

// domainSchema.set("toObject", {virtuals: true})
// domainSchema.set("toJSON", {virtuals: true})

const DomainModel = mongoose.model('Domain', domainSchema)
module.exports = DomainModel;
