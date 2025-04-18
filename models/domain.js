const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const UserModel = require("./user")

const mainSchema = new Schema({
    domain: { type: String, required: true },
    creator: { type: mongoose.Schema.Types.ObjectId, ref: UserModel, index: true },
    // creator: { type: String, required: true }, 
    logo: { type: String },
    status: { type: String, default: "public" },
    sectors: [{
		title: { type: String, required: true},
        delegates: {
            type: [String],
			required: true,
            index: true,
			validate: {
				validator: function (value) {
				return Array.isArray(value) && value.length > 0;
				},
				message: 'At least one delegate is required.'
			},
        },
        // delegates: {
        //     type: [
        //       {
        //         _id: { type: String, ref: 'UserModel', required: true },
        //         // _id: { type: mongoose.Schema.Types.ObjectId, ref: 'UserModel', required: true },
        //         // name: { type: String, required: true },
        //         // role: {
        //         //   type: String,
        //         //   enum: ['member', 'admin'],
        //         //   default: 'member',
        //         //   required: true,
        //         // }
        //       }
        //     ],
        //     required: true
        //   },          
        data: [{
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

const DomainModel = mongoose.model('Domain', mainSchema)
module.exports = DomainModel;