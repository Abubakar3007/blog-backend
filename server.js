const express = require("express");
const mongoose = require("mongoose");
const crypto = require('crypto');
const cors = require("cors");
const dotenv = require("dotenv");
const Blog = require("./models/Blog"); // AI blogs
const Write = require("./models/Write"); // ✨ Manual blogs from form
const cron = require("node-cron");
const { generateBlogPost } = require("./controllers/blogController");

// for upload images
const multer = require("multer");
const path = require("path");
const fetch = require("node-fetch");


const User = require("./models/User"); // 👈 Add User model
const bcrypt = require("bcryptjs");    // 👈 Add bcrypt
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const Contact = require("./models/Contact");
const Comment = require('./models/Comments');

dotenv.config();
const app = express();
app.use(cors());
app.use(express.json());

app.use("/uploads", express.static(path.join(__dirname, "uploads"))); // Serve static images

const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI;

if (!MONGO_URI) {
    console.error("❌ MONGO_URI is missing in the .env file");
    process.exit(1);
}

// Connect to MongoDB
mongoose.connect(MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
})
    .then(() => {
        console.log("✅ MongoDB Connected");

        // Generate a blog post after DB is connected
        generateBlogPost()
            .then(() => console.log("✅ Blog generated successfully"))
            .catch(err => console.error("❌ Error generating blog:", err));
    })
    .catch(err => {
        console.error("❌ MongoDB Connection Error:", err);
        process.exit(1);
    });

// Start the server
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));

// ================================================
// 📝 Routes

// Fetch all AI-generated blogs
app.get("/blogs", async (req, res) => {
    try {
        const blogs = await Blog.find().sort({ createdAt: -1 });
        res.json(blogs);
    } catch (error) {
        console.error("❌ Error fetching blogs:", error);
        res.status(500).json({ error: "Server error fetching blogs" });
    }
});

// Fetch single blog (AI or user-written) by ID
app.get("/blogs/:id", async (req, res) => {
    try {
        let blog = await Blog.findById(req.params.id);

        if (!blog) {
            blog = await Write.findById(req.params.id);
        }

        if (!blog) {
            return res.status(404).json({ error: "Blog not found" });
        }

        res.json(blog);
    } catch (error) {
        console.error("❌ Error fetching blog:", error);
        if (error.kind === 'ObjectId') {
            return res.status(400).json({ error: "Invalid blog ID format" });
        }
        res.status(500).json({ error: "Server error fetching blog" });
    }
});

// Multer setup for local image uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, "uploads/"),
    filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`)
});

const upload = multer({ storage });

// Route to write blog (with AI or local image)
app.post("/write", upload.single("image"), async (req, res) => {
    try {
        const { category, subcategory, title, description, userId, caption } = req.body;

        if (!category || !subcategory || !title || !description || !userId) {
            return res.status(400).json({ error: "All fields are required including userId" });
        }

        let imageUrl = null;

        // 1️⃣ Use uploaded image if available
        if (req.file) {
            imageUrl = `/uploads/${req.file.filename}`;
        }

        // 2️⃣ Else, generate image using Replicate API
        if (!imageUrl) {
            const replicateResponse = await fetch("https://api.replicate.com/v1/predictions", {
                method: "POST",
                headers: {
                    "Authorization": `Token ${process.env.REPLICATE_API_TOKEN}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    version: "db21e45a3b471f5de8b7210b81d0d5c73124a0c2c55b1bf26a293af5b0c44dc2",
                    input: {
                        prompt: `Illustration for: ${title}`
                    }
                })
            });

            const replicateData = await replicateResponse.json();

            if (!replicateData.urls?.get) {
                return res.status(500).json({ error: "Image generation failed. No get URL." });
            }

            // Polling function
            const getImageResult = async (predictionUrl) => {
                while (true) {
                    const pollRes = await fetch(predictionUrl, {
                        headers: { "Authorization": `Token ${process.env.REPLICATE_API_TOKEN}` }
                    });
                    const pollData = await pollRes.json();

                    if (pollData.status === "succeeded") {
                        return pollData.output?.[0]; // image URL
                    } else if (pollData.status === "failed") {
                        throw new Error("Image generation failed during prediction");
                    }

                    await new Promise(resolve => setTimeout(resolve, 2000)); // wait 2 sec
                }
            };

            imageUrl = await getImageResult(replicateData.urls.get);
        }

        // Save blog to MongoDB
        const newWrite = new Write({
            userId,
            category,
            subcategory,
            title,
            description,
            caption,
            image: imageUrl
        });

        const savedWrite = await newWrite.save();
        res.status(201).json(savedWrite);

    } catch (error) {
        console.error("❌ Error in /write route:", error);
        res.status(500).json({ error: "Server error saving blog" });
    }
});

// My blogs
app.get("/my-blogs/:userId", async (req, res) => {
    try {
        const userBlogs = await Write.find({ userId: req.params.userId });
        res.json(userBlogs);
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch blogs" });
    }
});

app.get('/all-blogs', async (req, res) => {
    try {
        // Fetch AI blogs
        const aiBlogs = await Blog.find();

        // Fetch user blogs
        const userBlogs = await Write.find();

        // Add a field to identify source (optional)
        const aiBlogsWithType = aiBlogs.map(blog => ({ ...blog.toObject(), source: 'ai' }));
        const userBlogsWithType = userBlogs.map(blog => ({ ...blog.toObject(), source: 'user' }));

        // Combine both arrays
        const combinedBlogs = [...aiBlogsWithType, ...userBlogsWithType];

        // Sort by createdAt descending
        combinedBlogs.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

        res.json(combinedBlogs);
    } catch (error) {
        console.error("Error fetching all blogs:", error);
        res.status(500).json({ error: "Server error fetching blogs" });
    }
});

// register 
app.post("/register", async (req, res) => {
    try {
        const { name, email, password } = req.body;

        if (!name || !email || !password) {
            return res.status(400).json({ error: 'All fields are required' });
        }

        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({ error: 'Email already exists' });
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const newUser = new User({
            name,
            email,
            password: hashedPassword
        });

        const savedUser = await newUser.save()
        res.status(201).json({ message: 'User registered successfully', user: savedUser });
    }
    catch (error) {
        console.error('❌ Error registering user:', error);
        res.status(500).json({ error: 'Server error during registration' });
    }
})

// Login
app.post("/login", async (req, res) => {
    // find email password
    const { email, password } = req.body;

    try {
        // Check if user exists
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(400).json({ error: 'Invalid email or password' });
        }

        // Check if password is correct
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ error: 'Invalid email or password' });
        }

        // Generate JWT Token
        const token = jwt.sign(
            { userId: user._id, email: user.email },
            process.env.JWT_SECRET,
            { expiresIn: '1h' }  // Token expires in 1 hour
        );

        // Send back the token and user data (_id, email)
        res.status(200).json({
            token: token,      // JWT token
            _id: user._id,     // Send user._id explicitly
            email: user.email  // Optionally send user.email as well
        });

        res.json({ message: 'Login successful', token });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server error, please try again later' });
    }
})

// forget password
// Set up Nodemailer transporter (using Gmail SMTP here as an example)
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,  // Your email
        pass: process.env.EMAIL_PASS,  // Your email password
    },
});

app.post('/forgot-password', async (req, res) => {
    const { email } = req.body;

    if (!email) {
        return res.status(400).json({ message: 'Please provide an email address' });
    }

    try {
        // Check if the user exists in the database
        const user = await User.findOne({ email });

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Generate a reset token
        const resetToken = crypto.randomBytes(20).toString('hex');

        // Set token expiration (1 hour)
        const resetTokenExpiration = Date.now() + 3600000; // 1 hour

        // Store the reset token and expiration time in the user's record
        user.resetPasswordToken = resetToken;
        user.resetPasswordExpires = resetTokenExpiration;

        await user.save();

        // Create reset password link
        const resetUrl = `http://localhost:3000/reset-password/${resetToken}`;
        console.log(resetUrl)

        // Set up email content
        const mailOptions = {
            from: process.env.EMAIL_USER,
            to: email,
            subject: 'Password Reset Request',
            text: `You requested a password reset. Click the link to reset your password: ${resetUrl}`,
        };

        // Send email with the reset link
        await transporter.sendMail(mailOptions);

        // Respond with a success message
        res.status(200).json({ message: 'Password reset email sent successfully!' });
    } catch (error) {
        console.error('Error sending reset email:', error);
        res.status(500).json({ message: 'Internal server error. Please try again later.' });
    }
});

// Schedule AI blog generation at midnight daily
cron.schedule("0 0 * * *", async () => {
    console.log("📝 Generating AI blog posts...");
    for (let i = 0; i < 5; i++) {
        try {
            await generateBlogPost();
            console.log(`✅ Blog post ${i + 1} generated successfully`);
        } catch (error) {
            console.error(`❌ Error generating blog post ${i + 1}:`, error);
        }
    }
});

// contact page post
app.post('/contact', async (req, res) => {
    try {
        const { name, email, subject, message } = req.body;
        if (!name || !email || !subject || !message) {
            return res.status(400).json({ error: "Please fill in all fields." });
        }

        const newContact = new Contact({ name, email, subject, message }); //find all model from contact

        await newContact.save(); // save in database
        res.status(201).json({ message: "Your message has been sent successfully!" });

    }
    catch (error) {
        res.status(500).json({ error: "Server error. Please try again later." })
    }
})

// saved blog user save list
app.post('/save-blog', async (req, res) => {
    const { userId, blogId } = req.body;

    try {
        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ message: "User not found" });

        if (!user.savedBlogs.includes(blogId)) {
            user.savedBlogs.push(blogId);
            await user.save();
        }

        res.json({ message: "Blog saved successfully" });
    } catch (err) {
        res.status(500).json({ error: "Failed to save blog" });
    }
})

// Get saved blogs of a user
app.get("/saved-blogs/:userId", async (req, res) => {
    try {
        const user = await User.findById(req.params.userId).populate("savedBlogs");
        if (!user) return res.status(404).json({ message: "User not found" });

        res.json(user.savedBlogs);
    } catch (err) {
        res.status(500).json({ error: "Failed to fetch saved blogs" });
    }
});

// Remove a blog from user's saved blogs
app.delete('/remove-saved-blog', async (req, res) => {
    const { userId, blogId } = req.body;

    try {
        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ message: "User not found" });

        // Remove blogId from savedBlogs array
        user.savedBlogs = user.savedBlogs.filter(id => id.toString() !== blogId);
        await user.save();

        res.json({ message: "Blog removed from saved list" });
    } catch (err) {
        res.status(500).json({ error: "Failed to remove saved blog" });
    }
});

// POST - Create new comment or reply
app.post('/comments', async (req, res) => {
    try {
        const { blogId, parentId, text, userId } = req.body;
        if (!blogId || !text || !userId) {
            return res.status(400).json({ error: 'blogId, text and userId are required' });
        }
        const comment = new Comment({ blogId, parentId: parentId || null, text, userId });
        await comment.save();
        res.status(201).json(comment);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET - Fetch nested comments
app.get('/comments/:blogId', async (req, res) => {
    try {
        const { blogId } = req.params;
        const comments = await Comment.find({ blogId })
            .populate('userId', 'name avatar')
            .lean();

        const map = {};
        comments.forEach(c => {
            c.replies = [];
            map[c._id.toString()] = c;
        });

        const roots = [];
        comments.forEach(c => {
            if (c.parentId) {
                const parent = map[c.parentId.toString()];
                if (parent) parent.replies.push(c);
            } else {
                roots.push(c);
            }
        });

        res.json(roots);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Profile user get
app.get('/profile/:id', async (req, res) => {
    try {
        const user = await User.findById(req.params.id).select('-password');
        if (!user) return res.status(404).json({ error: 'User not found' });

        res.status(200).json(user);
    } catch (err) {
        console.error('Error fetching user:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// Update user bio
app.patch('/profile/:id', async (req, res) => {
    try {
        const updatedUser = await User.findByIdAndUpdate(
            req.params.id,
            { $set: req.body },
            { new: true }
        );
        res.status(200).json(updatedUser);
    } catch (err) {
        res.status(500).json({ message: "Error updating profile", error: err });
    }
});
