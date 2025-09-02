const mongoose = require("mongoose");
const UserSchema = new mongoose.Schema(
    {
        name: { type: String, require: true },
        email: { type: String, require: true },
        password: { type: String, require: true },
        bio: { type: String, default: 'Tell me about your self' },
        role: { type: String, default: 'user' },
        savedBlogs: [{ type: mongoose.Schema.Types.ObjectId, ref: "Blog" }]
    },
    { timestamps: true }
)

module.exports = mongoose.model("User", UserSchema);