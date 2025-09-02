const mongoose = require("mongoose");

const BlogSchema = new mongoose.Schema({
    topic:{type: String, required: true},
    title: { type: String, required: true }, // Make title required
    content: { type: String, required: true },
    imageUrl: { type: String },
}, { timestamps: true });

module.exports = mongoose.model("Blog", BlogSchema);
