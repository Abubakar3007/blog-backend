const mongoose = require("mongoose");

const WriteSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true },
    category: { type: String, required: true },
    subcategory: { type: String, required: true },
    title: { type: String, required: true },
    description: { type: String, required: true },
    image: { type: String }, // This should store image URL or filename
    caption: { type: String }, // 👈 Add this line
  },
  { timestamps: true }
);

module.exports = mongoose.model("Write", WriteSchema);