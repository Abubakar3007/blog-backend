// // models/Comment.js
// const mongoose = require('mongoose');

// const commentSchema = new mongoose.Schema({
//     blogId: {
//         type: mongoose.Schema.Types.ObjectId,
//         ref: 'Blog',
//         required: true,
//     },
//     parentId: {
//         type: mongoose.Schema.Types.ObjectId,
//         ref: 'Comment',
//         default: null,
//     },
//     userId: {
//         type: mongoose.Schema.Types.ObjectId,
//         ref: 'User', // Link to your User model
//         required: true,
//     },
//     text: {
//         type: String,
//         required: true,
//     },
//     likes: { type: Number, default: 0 },
//     dislikes: { type: Number, default: 0 },
// }, { timestamps: true });

// // Populate nested replies
// commentSchema.virtual('replies', {
//     ref: 'Comment',
//     localField: '_id',
//     foreignField: 'parentId',
// });

// commentSchema.set('toObject', { virtuals: true });
// commentSchema.set('toJSON', { virtuals: true });

// module.exports = mongoose.model('Comment', commentSchema);

// models/Comment.js
const mongoose = require('mongoose');

const commentSchema = new mongoose.Schema({
    blogId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Blog',
        required: true,
    },
    parentId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Comment',
        default: null,
    },
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    text: {
        type: String,
        required: true,
    },
    likes: { type: Number, default: 0 },
    dislikes: { type: Number, default: 0 },
}, { timestamps: true });

module.exports = mongoose.model('Comment', commentSchema);
