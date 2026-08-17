// ═══════════════════════════════════════════════════
// CropMind Backend Server (Express Version)
// Run: node server.js
// Opens at: http://localhost:3000
// ═══════════════════════════════════════════════════


require("dotenv").config();

// 💡 Yeh line check karegi ki key load hui ya nahi
console.log("🔑 Gemini API Key Status:", process.env.GEMINI_API_KEY ? "Loaded Successfully ✅" : "NOT Found in .env ❌");

const express = require("express");
const cors = require("cors");
const path = require("path");
const https = require("https");
const http = require("http");

const app = express();
const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, "public");

// ── MIDDLEWARE SETUP ─────────────────────────────────
app.use(cors());
// Image payload base64 me aata hai isliye 50mb limit rakhi hai
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

// Static files (HTML, CSS, JS) serve karne ke liye
app.use(express.static(PUBLIC_DIR));

// ── GLOBAL MEMORY CACHE FOR WORKING MODEL ────────────
let cachedWorkingModel = "gemini-flash-lite-latest";

// ── SMART GEMINI API PROXY ────────────────────────────
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

        function tryNextModel(index) {
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
        }

        tryNextModel(0);
      } catch (e) {
        safeCallback(e);
      }
    });
  });

  req.on("error", (e) => safeCallback(e));
  req.end();
}

// ── WEATHER PROXY ────────────────────────────────────
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

// ── GEOCODE PROXY ────────────────────────────────────
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

// ── IP LOCATION PROXY ─────────────────────────────────
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








// ── API ROUTES ────────────────────────────────────────

// POST /api/diagnose
app.post("/api/diagnose", (req, res) => {
  // Pehle request body se key dekho, nahi mili toh .env file se uthao
  const apiKey = req.body.apiKey || process.env.GEMINI_API_KEY;
  const { prompt, imageBase64, mimeType, selectedCrop } = req.body;

  if (!apiKey) {
    return res.status(400).json({ error: "API key required in .env or request body" });
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

// POST /api/chat
app.post("/api/chat", (req, res) => {
  // Request body se key dekho, nahi toh .env se GEMINI_API_KEY use karo
  const apiKey = req.body.apiKey || process.env.GEMINI_API_KEY;
  const { message, lang } = req.body;

  if (!apiKey) {
    return res.status(400).json({ error: "API key required in .env or request body" });
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

// GET /api/weather (No API Key Required - Uses Open-Meteo)
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

// GET /api/city (No API Key Required - Uses OpenStreetMap)
app.get("/api/city", (req, res) => {
  const { lat, lon } = req.query;
  getCity(lat, lon, (err, city) => {
    res.json({ city: city || "India" });
  });
});

// GET /api/location (No API Key Required - Uses IP-API)
app.get("/api/location", (req, res) => {
  getIPLocation((err, data) => {
    if (err) return res.json({ error: err.message });
    res.json(data);
  });
});

// Fallback route: Baki saare URLs ke liye index.html bhej do (Express 5 Syntax)
app.use((req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, "index.html"));
});









// ── START SERVER ──────────────────────────────────────
app.listen(PORT, () => {
  console.log("");
  console.log("🌾 ═══════════════════════════════════════");
  console.log("   CropMind Server Running with Express!");
  console.log(`   Open: http://localhost:3000`);
  console.log("🌾 ═══════════════════════════════════════");
  console.log("");
});
