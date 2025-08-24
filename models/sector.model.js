const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const sectorSchema = new Schema({
	domain_id: {
		type: Schema.Types.ObjectId,
		ref: "Domain"
	},
	creator_id: {
		type: Schema.Types.ObjectId,
		ref: "User"
	},
	title: {
		type: String,
		required: true
	},
	link: {
		type: String
	},
	status: {
		type: String,
	}
});

// sectorSchema.virtual("data", {
//     ref: "Issue",
//     localField: "_id",
//     foreignField: "sector_id"
// })

// sectorSchema.set("toObject", {virtuals: true})
// sectorSchema.set("toJSON", {virtuals: true})

const SectorModel = mongoose.model("Sector", sectorSchema);
module.exports = SectorModel
