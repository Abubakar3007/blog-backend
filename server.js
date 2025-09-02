const express = require("express");
const mongoose = require("mongoose");
const crypto = require("crypto");
const cors = require("cors");
const dotenv = require("dotenv");
const path = require("path");
const multer = require("multer");
const fetch = require("node-fetch");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const nodemailer = require("nodemailer");
const cron = require("node-cron");

const Blog = require("./models/Blog");
const Write = require("./models/Write");
const User = require("./models/User");
const Contact = require("./models/Contact");
const Comment = require("./models/Comments");
const { generateBlogPost } = require("./controllers/blogController");

dotenv.config();
const app = express();
const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI;
const JWT_SECRET = process.env.JWT_SECRET;

// 🔐 Validate required env variables
if (!MONGO_URI || !JWT_SECRET) {
  console.error("❌ Missing required environment variables (MONGO_URI or JWT_SECRET)");
  process.exit(1);
}

app.use(cors());
app.use(express.json());

// ========================
// 🔥 MongoDB Connection
// ========================
mongoose
  .connect(MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => console.log("✅ MongoDB Connected"))
  .catch((err) => {
    console.error("❌ MongoDB Connection Error:", err);
    process.exit(1);
  });

// ========================
// 🔥 Static Files
// ========================
app.use("/uploads", express.static(path.join(__dirname, "uploads")));
app.use(express.static(path.join(__dirname, "../frontend/build")));

// Catch-all route for frontend
app.get("/*", (req, res) => {
  res.sendFile(path.join(__dirname, "../frontend/build", "index.html"));
});

// ========================
// 🔥 Multer Setup
// ========================
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "uploads/"),
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
});
const upload = multer({ storage });

// ========================
// 🔥 Routes
// ========================

// Blogs
app.get("/blogs", async (req, res) => {
  try {
    const blogs = await Blog.find().sort({ createdAt: -1 });
    res.json(blogs);
  } catch (err) {
    console.error("❌ Error fetching blogs:", err);
    res.status(500).json({ error: "Server error fetching blogs" });
  }
});

// Fetch blog by ID (from Blog or Write)
app.get("/blogs/:id", async (req, res) => {
  try {
    let blog = await Blog.findById(req.params.id) || await Write.findById(req.params.id);
    if (!blog) return res.status(404).json({ error: "Blog not found" });
    res.json(blog);
  } catch (err) {
    console.error("❌ Error fetching blog:", err);
    res.status(500).json({ error: "Invalid or missing blog ID" });
  }
});

// Create blog with AI or uploaded image
app.post("/write", upload.single("image"), async (req, res) => {
  try {
    const { category, subcategory, title, description, userId, caption } = req.body;
    if (!category || !subcategory || !title || !description || !userId)
      return res.status(400).json({ error: "All fields are required" });

    let imageUrl = req.file ? `/uploads/${req.file.filename}` : null;

    // If no image uploaded, use Replicate API
    if (!imageUrl && process.env.REPLICATE_API_TOKEN) {
      const replicateResponse = await fetch("https://api.replicate.com/v1/predictions", {
        method: "POST",
        headers: {
          Authorization: `Token ${process.env.REPLICATE_API_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          version: "db21e45a3b471f5de8b7210b81d0d5c73124a0c2c55b1bf26a293af5b0c44dc2",
          input: { prompt: `Illustration for: ${title}` },
        }),
      });
      const replicateData = await replicateResponse.json();
      const predictionUrl = replicateData?.urls?.get;

      if (predictionUrl) {
        imageUrl = await (async function poll() {
          while (true) {
            const pollRes = await fetch(predictionUrl, {
              headers: { Authorization: `Token ${process.env.REPLICATE_API_TOKEN}` },
            });
            const pollData = await pollRes.json();
            if (pollData.status === "succeeded") return pollData.output?.[0];
            if (pollData.status === "failed") throw new Error("Image generation failed");
            await new Promise((r) => setTimeout(r, 2000));
          }
        })();
      }
    }

    const newWrite = new Write({ userId, category, subcategory, title, description, caption, image: imageUrl });
    const savedWrite = await newWrite.save();
    res.status(201).json(savedWrite);
  } catch (err) {
    console.error("❌ Error saving blog:", err);
    res.status(500).json({ error: "Failed to save blog" });
  }
});

// Register
app.post("/register", async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) return res.status(400).json({ error: "All fields required" });

    const existingUser = await User.findOne({ email });
    if (existingUser) return res.status(400).json({ error: "Email already exists" });

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = await User.create({ name, email, password: hashedPassword });
    res.status(201).json({ message: "User registered", user: newUser });
  } catch (err) {
    res.status(500).json({ error: "Registration failed" });
  }
});

// Login
app.post("/login", async (req, res) => {
  const { email, password } = req.body;
  try {
    const user = await User.findOne({ email });
    if (!user || !(await bcrypt.compare(password, user.password)))
      return res.status(400).json({ error: "Invalid credentials" });

    const token = jwt.sign({ userId: user._id, email: user.email }, JWT_SECRET, { expiresIn: "1h" });
    res.json({ token, _id: user._id, email: user.email });
  } catch (err) {
    res.status(500).json({ error: "Login failed" });
  }
});

// Forgot Password
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
});

app.post("/forgot-password", async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ message: "User not found" });

    const resetToken = crypto.randomBytes(20).toString("hex");
    user.resetPasswordToken = resetToken;
    user.resetPasswordExpires = Date.now() + 3600000;
    await user.save();

    const resetUrl = `${process.env.CLIENT_URL || "http://localhost:3000"}/reset-password/${resetToken}`;
    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: email,
      subject: "Password Reset",
      text: `Click to reset your password: ${resetUrl}`,
    });

    res.json({ message: "Password reset email sent" });
  } catch (err) {
    res.status(500).json({ message: "Error sending reset email" });
  }
});

// ========================
// 🔥 Cron Jobs
// ========================
cron.schedule("0 0 * * *", async () => {
  console.log("📝 Generating AI blogs...");
  for (let i = 0; i < 5; i++) {
    try {
      await generateBlogPost();
      console.log(`✅ Blog post ${i + 1} generated`);
    } catch (err) {
      console.error(`❌ Error generating blog ${i + 1}:`, err);
    }
  }
});

// ========================
// 🔥 Start Server
// ========================
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
