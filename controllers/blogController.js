const axios = require("axios");
const cron = require("node-cron");
const Blog = require("../models/Blog");
const cloudinary = require("cloudinary").v2;
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
require("dotenv").config(); // Make sure this is included

// Cloudinary Config
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
});

const generateBlogPost = async () => {
    try {
        // 🧠 Step 1: Generate title
        const medicalTopics = [
            "mental health",
            "nutrition",
            "cardiology",
            "dental care",
            "women's health",
            "AI in healthcare",
            "chronic disease prevention",
            "medical technology",
            "skin care",
            "fitness & wellness",
            "preventive healthcare",
            "sleep disorders and hygiene",
            "stress management techniques",
            "holistic medicine",
            "aging and geriatric care",
            "neurology and brain health",
            "oncology",
            "pediatrics and child health",
            "endocrinology",
            "gastroenterology",
            "psychology",
            "anxiety and depression treatments",
            "cognitive behavioral therapy (CBT)",
            "addiction and recovery",
            "mindfulness and meditation",
            "PTSD and trauma therapy",
            "telemedicine and virtual care",
            "wearable health tech",
            "robotics in surgery",
            "blockchain in healthcare",
            "3D printing of medical devices",
            "pandemic preparedness",
            "vaccination and immunization",
            "health disparities and equity",
            "global health initiatives",
            "healthcare reform",
            "sports medicine",
            "weight management strategies",
            "plant-based diets",
            "gut microbiome health",
            "superfoods and supplements",
            "reproductive health",
            "menopause management",
            "fertility treatments",
            "prostate health",
            "hormonal imbalances",
            "acupuncture and traditional Chinese medicine",
            "ayurveda",
            "herbal remedies",
            "chiropractic care",
            "homeopathy",
        ];
        const randomTopic = medicalTopics[Math.floor(Math.random() * medicalTopics.length)];

        const topicResponse = await axios.post(
            "https://api.together.xyz/v1/completions",
            {
                model: "mistralai/Mistral-7B-Instruct-v0.1",
                prompt: `Generate a unique and informative title for a medical blog post about ${randomTopic}. Only return the title.`,
                max_tokens: 30,
                temperature: 0.8,
                top_p: 0.9
            },
            {
                headers: {
                    "Authorization": `Bearer ${process.env.TOGETHER_AI_API_KEY}`,
                    "Content-Type": "application/json"
                }
            }
        );

        const rawTitle = topicResponse.data.choices[0]?.text?.trim();
        if (!rawTitle) throw new Error("No title received from AI.");
        const title = rawTitle.replace(/^["']?|["']?$/g, "");

        // 📝 Step 2: Generate content
        const contentResponse = await axios.post(
            "https://api.together.xyz/v1/completions",
            {
                model: "mistralai/Mistral-7B-Instruct-v0.1",
                prompt: `Write a detailed and well-structured medical blog article titled "${title}". Include subheadings, bullet points, and a call to action at the end. Make it at least 500 words.`,
                max_tokens: 1000,
                temperature: 0.8,
                top_p: 0.9
            },
            {
                headers: {
                    "Authorization": `Bearer ${process.env.TOGETHER_AI_API_KEY}`,
                    "Content-Type": "application/json"
                }
            }
        );

        const rawContent = contentResponse.data.choices[0]?.text?.trim();
        if (!rawContent) throw new Error("No content received from AI.");
        const content = rawContent;

        // 🖼️ Step 3: Generate image with Hugging Face
        const intro = content.split("\n").slice(0, 2).join(" ");
        const imagePrompt = `Professional medical illustration, hyper realistic, high detail, for a blog titled: "${title}". Context: ${intro}`;

        let imageUrl = "";
        try {
            console.log("🔄 Generating image with Hugging Face...");

            const hfResponse = await fetch("https://api-inference.huggingface.co/models/stabilityai/stable-diffusion-2", {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${process.env.HF_API_TOKEN}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ inputs: imagePrompt })
            });

            if (!hfResponse.ok) {
                throw new Error(`Hugging Face response failed: ${hfResponse.statusText}`);
            }

            const buffer = await hfResponse.buffer();

            // Upload image buffer to Cloudinary
            const base64Image = `data:image/png;base64,${buffer.toString("base64")}`;

            const uploadResponse = await cloudinary.uploader.upload(base64Image, {
                folder: "huggingface-images"
            });

            imageUrl = uploadResponse.secure_url;
            console.log("🖼️ Image uploaded to Cloudinary:", imageUrl);

        } catch (imageError) {
            console.error("❌ Image generation/upload failed:", imageError.message);

            try {
                const uploadResponse = await cloudinary.uploader.upload(
                    "https://via.placeholder.com/1024x1024.png?text=Medical+Blog",
                    { folder: "blog-placeholders" }
                );
                imageUrl = uploadResponse.secure_url;
            } catch (uploadError) {
                console.error("❌ Cloudinary fallback upload failed:", uploadError.message);
            }
        }

        // 💾 Step 4: Save to database
        const newBlog = new Blog({
            topic: randomTopic.trim().toLowerCase(),
            title,
            content,
            imageUrl,
            generatedAt: new Date()
        });
        await newBlog.save();
        console.log("✅ Blog saved successfully:", newBlog._id);
    } catch (error) {
        console.error("❌ Error generating blog:", error.message);
    }
};

// 🔁 Schedule to run every 1 hour
cron.schedule("0 * * * *", async () => {
    console.log("⏰ Hourly blog generation triggered at", new Date().toISOString());
    try {
        await generateBlogPost();
    } catch (err) {
        console.error("❌ Cron job failed:", err.message);
    }
});

module.exports = { generateBlogPost };
