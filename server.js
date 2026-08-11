// ═══════════════════════════════════════════════════
// CropMind Backend Server
// Run: node server.js
// Opens at: http://localhost:3000
// ═══════════════════════════════════════════════════

const http = require("http");
const fs = require("fs");
const path = require("path");
const https = require("https");
const url = require("url");

// const PORT = 3000;
const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, "public");

// ── MIME TYPES ─────
const MIME = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "application/javascript",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".ico": "image/x-icon",
};

// ── GLOBAL MEMORY CACHE FOR WORKING MODEL ────────────
let cachedWorkingModel = "gemini-flash-lite-latest"; // Set to the working model from your log

// ── SMART GEMINI API PROXY ────────────────────────────
function callGeminiAPI(apiKey, body, callback) {
  let hasResponded = false;

  const safeCallback = (err, result) => {
    if (!hasResponded) {
      hasResponded = true;
      callback(err, result);
    }
  };

  // Step 1: Fetch all available models from Google API
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

        // Filter valid content generation models
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

        // PRIORITY ORDER: Put working models for your free quota at the absolute top!
        const priorityOrder = [
          "gemini-flash-lite-latest",
          "gemini-1.5-flash",
          "gemini-1.5-flash-8b",
          "gemini-1.5-pro",
          "gemini-2.0-flash-lite",
        ];

        // If we already know a model works, force it to Index 0
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

        // Step 2: Sequentially try models starting from Index 0
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
                  // If cached model failed, clear cache
                  if (cachedWorkingModel === model) cachedWorkingModel = null;
                  tryNextModel(index + 1);
                } else {
                  console.log(
                    `  ✅ Model ${model} succeeded! Saved as default.`,
                  );
                  cachedWorkingModel = model; // Cache this working model!
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

// ── PARSE REQUEST BODY ────────────────────────────────
function parseBody(req, callback) {
  let body = "";
  req.on("data", (chunk) => (body += chunk));
  req.on("end", () => {
    try {
      callback(JSON.parse(body));
    } catch (e) {
      callback({});
    }
  });
}

// ── MAIN SERVER ───────────────────────────────────────
const server = http.createServer((req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;

  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.writeHead(200);
    res.end();
    return;
  }

  // POST /api/diagnose
  if (pathname === "/api/diagnose" && req.method === "POST") {
    parseBody(req, (body) => {
      const { apiKey, prompt, imageBase64, mimeType } = body;
      if (!apiKey) {
        if (!res.headersSent) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "API key required" }));
        }
        return;
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
          prompt ||
          "Identify the disease in this crop image and suggest remedies.",
      });
      console.log(
        "📊 Running diagnosis for crop:",
        body.selectedCrop || "unknown",
      );

      callGeminiAPI(apiKey, { contents: [{ parts }] }, (err, data) => {
        if (res.headersSent) return;
        res.writeHead(200, { "Content-Type": "application/json" });
        if (err) {
          console.log("❌ Diagnosis error:", err.message);
          res.end(JSON.stringify({ geminiError: err.message }));
        } else if (data && data.error) {
          console.log("❌ Gemini error:", data.error.message);
          res.end(
            JSON.stringify({
              geminiError: data.error.message,
              code: data.error.code,
            }),
          );
        } else {
          console.log("✅ Diagnosis successful");
          res.end(JSON.stringify(data));
        }
      });
    });
    return;
  }

  // POST /api/chat
  if (pathname === "/api/chat" && req.method === "POST") {
    parseBody(req, (body) => {
      const { apiKey, message, lang } = body;
      if (!apiKey) {
        if (!res.headersSent) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "API key required" }));
        }
        return;
      }
      const langName =
        { mr: "Marathi", hi: "Hindi", ta: "Tamil", en: "English" }[lang] ||
        "Marathi";
      const prompt = `You are a helpful Indian agriculture expert. Answer in ${langName} only. Under 120 words. Practical advice. Question: ${message}`;
      callGeminiAPI(
        apiKey,
        { contents: [{ parts: [{ text: prompt }] }] },
        (err, data) => {
          if (res.headersSent) return;
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify(
              err
                ? { error: err.message }
                : data.error
                  ? { geminiError: data.error.message }
                  : data,
            ),
          );
        },
      );
    });
    return;
  }

  // GET /api/weather
  if (pathname === "/api/weather" && req.method === "GET") {
    const { lat, lon } = parsedUrl.query;
    if (!lat || !lon) {
      if (!res.headersSent) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "lat and lon required" }));
      }
      return;
    }
    fetchWeather(lat, lon, (err, data) => {
      if (res.headersSent) return;
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(err ? { error: err.message } : data));
    });
    return;
  }

  // GET /api/city
  if (pathname === "/api/city" && req.method === "GET") {
    const { lat, lon } = parsedUrl.query;
    getCity(lat, lon, (err, city) => {
      if (res.headersSent) return;
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ city: city || "India" }));
    });
    return;
  }

  // GET /api/location
  if (pathname === "/api/location" && req.method === "GET") {
    getIPLocation((err, data) => {
      if (res.headersSent) return;
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(err ? { error: err.message } : data));
    });
    return;
  }

  // Serve static files
  let filePath = path.join(
    PUBLIC_DIR,
    pathname === "/" ? "index.html" : pathname,
  );
  const ext = path.extname(filePath);
  const contentType = MIME[ext] || "text/plain";

  fs.readFile(filePath, (err, data) => {
    if (res.headersSent) return;
    if (err) {
      fs.readFile(path.join(PUBLIC_DIR, "index.html"), (err2, data2) => {
        if (err2) {
          res.writeHead(404);
          res.end("Not found");
          return;
        }
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(data2);
      });
      return;
    }
    res.writeHead(200, { "Content-Type": contentType });
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log("");
  console.log("🌾 ═══════════════════════════════════════");
  console.log("   CropMind Server Running!");
  console.log(`   Open: http://localhost:3000`);
  console.log("🌾 ═══════════════════════════════════════");
  console.log("");
});
