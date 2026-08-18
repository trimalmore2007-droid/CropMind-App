// ========================================================
// SECTION 1: ENVIRONMENT & IMPORTS
// ========================================================

require("dotenv").config();

const express = require("express");
const cors = require("cors");
const path = require("path");
const https = require("https");
const http = require("http");
const mongoose = require("mongoose");
const { OAuth2Client } = require("google-auth-library");

// ========================================================
// SECTION 2: APP & MIDDLEWARE SETUP
// ========================================================

const app = express();
const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, "public");

// CORS configuration (allows all origins for development)
app.use(cors());

// JSON body parser with increased limit for base64 image payloads
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

// Serve static files from the "public" directory
app.use(express.static(PUBLIC_DIR));

// ========================================================
// SECTION 3: CLIENT & DATABASE INITIALIZATIONS
// ========================================================

// Google OAuth Client
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// MongoDB Connection
const MONGO_URI = process.env.MONGO_URI;

if (MONGO_URI) {
  mongoose
    .connect(MONGO_URI)
    .then(() => console.log("🌱 MongoDB Atlas Connected Successfully!"))
    .catch((err) => console.error("❌ MongoDB Connection Error:", err));
} else {
  console.log("⚠️ MONGO_URI is missing in .env file");
}

// ========================================================
// SECTION 4: SCHEMAS & MODELS
// ========================================================

const userSchema = new mongoose.Schema({
  googleId: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  email: { type: String, required: true },
  picture: { type: String },
  village: { type: String, default: "" },
  crop: { type: String, default: "" },
  soil: { type: String, default: "" },
  createdAt: { type: Date, default: Date.now },
});

// Safe model initialization to prevent overwriting if the model is already registered
const User = mongoose.models.User || mongoose.model("User", userSchema);

console.log(
  "🔑 Gemini API Key Status:",
  process.env.GEMINI_API_KEY
    ? "Loaded Successfully ✅"
    : "NOT Found in .env ❌",
);

// ========================================================
// SECTION 5: HELPER FUNCTIONS & UTILITIES
// ========================================================

let cachedWorkingModel = "gemini-flash-lite-latest";

/**
 * Smart proxy for Google Gemini API.
 * Fetches available models, auto-selects the best working one,
 * and retries on failure with fallback models.
 */
function callGeminiAPI(apiKey, body, callback) {
  let hasResponded = false;

  const safeCallback = (err, result) => {
    if (!hasResponded) {
      hasResponded = true;
      callback(err, result);
    }
  };

  const listOptions = {
    hostname: "generativelanguage.googleapis.com",
    path: `/v1beta/models?key=${apiKey}`,
    method: "GET",
  };

  const req = https.request(listOptions, (res) => {
    let data = "";
    res.on("data", (chunk) => (data += chunk));
    res.on("end", () => {
      try {
        const parsedList = JSON.parse(data);

        if (parsedList.error) {
          console.log("❌ API Key Error:", parsedList.error.message);
          return safeCallback(null, parsedList);
        }

        let validModels = (parsedList.models || [])
          .filter((m) =>
            m.supportedGenerationMethods?.includes("generateContent"),
          )
          .map((m) => m.name.replace("models/", ""))
          .filter((name) => {
            const lower = name.toLowerCase();
            return (
              !lower.includes("tts") &&
              !lower.includes("lyria") &&
              !lower.includes("robotics") &&
              !lower.includes("computer-use") &&
              !lower.includes("antigravity") &&
              !lower.includes("deep-research")
            );
          });

        if (!validModels || validModels.length === 0) {
          return safeCallback(null, {
            error: { message: "No compatible Gemini text models found." },
          });
        }

        const priorityOrder = [
          "gemini-flash-lite-latest",
          "gemini-1.5-flash",
          "gemini-1.5-flash-8b",
          "gemini-1.5-pro",
          "gemini-2.0-flash-lite",
        ];

        if (cachedWorkingModel) {
          validModels = validModels.filter((m) => m !== cachedWorkingModel);
          validModels.unshift(cachedWorkingModel);
        } else {
          validModels.sort((a, b) => {
            const indexA = priorityOrder.findIndex((p) =>
              a.toLowerCase().startsWith(p),
            );
            const indexB = priorityOrder.findIndex((p) =>
              b.toLowerCase().startsWith(p),
            );
            if (indexA !== -1 && indexB !== -1) return indexA - indexB;
            if (indexA !== -1) return -1;
            if (indexB !== -1) return 1;
            return 0;
          });
        }

        const tryNextModel = (index) => {
          if (hasResponded) return;

          if (index >= validModels.length) {
            return safeCallback(null, {
              error: {
                message:
                  "All available Gemini models failed or quota limit reached.",
              },
            });
          }

          const model = validModels[index];
          const postData = JSON.stringify(body);
          const postOptions = {
            hostname: "generativelanguage.googleapis.com",
            path: `/v1beta/models/${model}:generateContent?key=${apiKey}`,
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Content-Length": Buffer.byteLength(postData),
            },
          };

          console.log(
            `  Trying model (${index + 1}/${validModels.length}): ${model}`,
          );

          let reqDone = false;
          const postReq = https.request(postOptions, (postRes) => {
            let resData = "";
            postRes.on("data", (chunk) => (resData += chunk));
            postRes.on("end", () => {
              if (hasResponded || reqDone) return;
              reqDone = true;

              try {
                const parsedData = JSON.parse(resData);
                if (parsedData.error) {
                  console.log(
                    `  ⚠️ Model ${model} error: ${parsedData.error.message}`,
                  );
                  if (cachedWorkingModel === model) cachedWorkingModel = null;
                  tryNextModel(index + 1);
                } else {
                  console.log(
                    `  ✅ Model ${model} succeeded! Saved as default.`,
                  );
                  cachedWorkingModel = model;
                  safeCallback(null, parsedData);
                }
              } catch (e) {
                tryNextModel(index + 1);
              }
            });
          });

          postReq.on("error", (e) => {
            if (reqDone) return;
            reqDone = true;
            console.log(`  Network error on ${model}:`, e.message);
            if (cachedWorkingModel === model) cachedWorkingModel = null;
            tryNextModel(index + 1);
          });

          postReq.setTimeout(10000, () => {
            if (reqDone) return;
            reqDone = true;
            postReq.destroy();
            if (cachedWorkingModel === model) cachedWorkingModel = null;
            tryNextModel(index + 1);
          });

          postReq.write(postData);
          postReq.end();
        };

        tryNextModel(0);
      } catch (e) {
        safeCallback(e);
      }
    });
  });

  req.on("error", (e) => safeCallback(e));
  req.end();
}

/**
 * Fetch weather data from Open-Meteo.
 */
function fetchWeather(lat, lon, callback) {
  const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m,apparent_temperature,weather_code&timezone=auto`;

  https
    .get(weatherUrl, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          callback(null, JSON.parse(data));
        } catch (e) {
          callback(e);
        }
      });
    })
    .on("error", callback);
}

/**
 * Reverse geocoding to get city name from coordinates using OpenStreetMap.
 */
function getCity(lat, lon, callback) {
  const options = {
    hostname: "nominatim.openstreetmap.org",
    path: `/reverse?lat=${lat}&lon=${lon}&format=json`,
    method: "GET",
    headers: { "User-Agent": "CropMind/1.0" },
  };

  https
    .get(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          const d = JSON.parse(data);
          const city =
            d.address?.city ||
            d.address?.town ||
            d.address?.village ||
            d.address?.district ||
            "India";
          callback(null, city);
        } catch (e) {
          callback(null, "India");
        }
      });
    })
    .on("error", () => callback(null, "India"));
}

/**
 * Fetch location based on IP address.
 */
function getIPLocation(callback) {
  https
    .get("https://ipapi.co/json/", (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.error || !parsed.latitude) {
            fetchFallbackIP(callback);
          } else {
            callback(null, parsed);
          }
        } catch (e) {
          fetchFallbackIP(callback);
        }
      });
    })
    .on("error", () => fetchFallbackIP(callback));
}

/**
 * Fallback IP location service.
 */
function fetchFallbackIP(callback) {
  http
    .get("http://ip-api.com/json/", (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          const d = JSON.parse(data);
          if (d.status === "success") {
            callback(null, {
              latitude: d.lat,
              longitude: d.lon,
              city: d.city,
              region: d.regionName,
            });
          } else {
            callback(new Error("IP location failed"));
          }
        } catch (e) {
          callback(e);
        }
      });
    })
    .on("error", callback);
}

// ========================================================
// SECTION 6: API ROUTES
// ========================================================

/**
 * POST /api/diagnose
 * Crop disease diagnosis using Gemini AI (text + optional image).
 */
app.post("/api/diagnose", (req, res) => {
  const apiKey = req.body.apiKey || process.env.GEMINI_API_KEY;
  const { prompt, imageBase64, mimeType, selectedCrop } = req.body;

  if (!apiKey) {
    return res
      .status(400)
      .json({ error: "API key required in .env or request body" });
  }

  const parts = [];
  if (imageBase64) {
    parts.push({
      inline_data: {
        mime_type: mimeType || "image/jpeg",
        data: imageBase64,
      },
    });
  }
  parts.push({
    text:
      prompt || "Identify the disease in this crop image and suggest remedies.",
  });

  console.log("📊 Running diagnosis for crop:", selectedCrop || "unknown");

  callGeminiAPI(apiKey, { contents: [{ parts }] }, (err, data) => {
    if (err) {
      console.log("❌ Diagnosis error:", err.message);
      return res.json({ geminiError: err.message });
    }
    if (data && data.error) {
      console.log("❌ Gemini error:", data.error.message);
      return res.json({
        geminiError: data.error.message,
        code: data.error.code,
      });
    }
    console.log("✅ Diagnosis successful");
    res.json(data);
  });
});

/**
 * POST /api/chat
 * AI-powered farming assistant chat.
 */
app.post("/api/chat", (req, res) => {
  const apiKey = req.body.apiKey || process.env.GEMINI_API_KEY;
  const { message, lang } = req.body;

  if (!apiKey) {
    return res
      .status(400)
      .json({ error: "API key required in .env or request body" });
  }

  const langName =
    { mr: "Marathi", hi: "Hindi", ta: "Tamil", en: "English" }[lang] ||
    "Marathi";
  const promptText = `You are a helpful Indian agriculture expert. Answer in ${langName} only. Under 120 words. Practical advice. Question: ${message}`;

  callGeminiAPI(
    apiKey,
    { contents: [{ parts: [{ text: promptText }] }] },
    (err, data) => {
      if (err) return res.json({ error: err.message });
      if (data.error) return res.json({ geminiError: data.error.message });
      res.json(data);
    },
  );
});

/**
 * GET /api/weather
 * Fetches live weather data from Open-Meteo.
 */
app.get("/api/weather", (req, res) => {
  const { lat, lon } = req.query;
  if (!lat || !lon) {
    return res.status(400).json({ error: "lat and lon required" });
  }
  fetchWeather(lat, lon, (err, data) => {
    if (err) return res.json({ error: err.message });
    res.json(data);
  });
});

/**
 * GET /api/city
 * Reverse geocoding to get city name from coordinates.
 */
app.get("/api/city", (req, res) => {
  const { lat, lon } = req.query;
  getCity(lat, lon, (err, city) => {
    res.json({ city: city || "India" });
  });
});

/**
 * GET /api/location
 * Fetches approximate location based on IP address.
 */
app.get("/api/location", (req, res) => {
  getIPLocation((err, data) => {
    if (err) return res.json({ error: err.message });
    res.json(data);
  });
});

/**
 * POST /api/auth/google
 * Google OAuth 2.0 authentication endpoint.
 * Verifies the ID token and syncs user data with MongoDB.
 */
app.post("/api/auth/google", async (req, res) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({ success: false, error: "Token required" });
    }

    // Verify Google ID Token
    const ticket = await googleClient.verifyIdToken({
      idToken: token,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    const { sub: googleId, name, email, picture } = payload;

    // Prepare user object for frontend and DB
    const user = {
      googleId,
      name,
      email,
      picture,
      village: "Latur", // Placeholder; can be made dynamic later
      crop: "Wheat", // Placeholder; can be made dynamic later
      soil: "Black Soil", // Placeholder; can be made dynamic later
    };

    // Sync with MongoDB (fail silently if DB is not connected)
    try {
      if (typeof User !== "undefined") {
        let dbUser = await User.findOne({ googleId });
        if (!dbUser) {
          dbUser = new User(user);
          await dbUser.save();
        }
      }
    } catch (dbErr) {
      console.log("⚠️ DB Save Skipped:", dbErr.message);
    }

    return res.json({ success: true, user });
  } catch (error) {
    console.error("❌ Google Auth Backend Error:", error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// ========================================================
// SECTION 7: SPA FALLBACK ROUTE
// ========================================================

/**
 * Catch-all route for Single Page Application (SPA).
 * Serves index.html for any unmatched route (client-side routing).
 */
app.use((req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, "index.html"));
});
  
// ========================================================
// SECTION 8: GLOBAL ERROR HANDLING & SERVER STARTUP
// ========================================================

/**
 * Global error handling middleware.
 * Catches any unhandled errors and sends a generic 500 response.
 */
app.use((err, req, res, next) => {
  console.error("❌ Unhandled Server Error:", err.stack || err);
  res.status(500).json({
    error: "Internal Server Error",
    message: process.env.NODE_ENV === "development" ? err.message : undefined,
  });
});

// Start the server
app.listen(PORT, () => {
  console.log(
    "                                             ||═══════════════════════════════════════════════════||",
  );
  console.log(
    "                                             ||                                                   ||",
  );
  console.log(
    "                                             ||   CropMind Backend Server (Express Version)       ||",
  );
  console.log(
    "                                             ||   Run: node server.js                             ||",
  );
  console.log(
    "                                             ||   Opens at: http://localhost:3000                 ||",
  );
  console.log(
    "                                             ||                                                   ||",
  );
  console.log(
    "                                             ||═══════════════════════════════════════════════════||",
  );
  console.log("                                             ");
});
