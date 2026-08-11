// ── STATE ──────
const state = {
  lang: localStorage.getItem("cm_lang") || "mr",
  tab: "home",
  showSettings: false,
  profile: (() => {
    try {
      return (
        JSON.parse(localStorage.getItem("cm_profile")) || {
          name: "",
          village: "",
          crop: "wheat",
          soil: "black",
        }
      );
    } catch {
      return { name: "", village: "", crop: "wheat", soil: "black" };
    }
  })(),
  apiKey: localStorage.getItem("cm_apikey") || "",
  weather: (() => {
    try {
      return JSON.parse(localStorage.getItem("cm_weather"));
    } catch {
      return null;
    }
  })(),
  cityName: localStorage.getItem("cm_city") || "",
  offline: !navigator.onLine,
  profileSaved: false,
  apiSaved: false,
  selectedCrop: "wheat",
  selectedSoil: "black",
  symptoms: "",
  photo: null,
  photoBase64: null,
  diagnosing: false,
  diagnosis: null,
  listening: false,
  storeFilter: "all",
  recommendedProducts: [],
  cropSearch: "",
  selectedCropDetail: null,
  learnTab: "schemes",
  badges: (() => {
    try {
      return JSON.parse(localStorage.getItem("cm_badges")) || [];
    } catch {
      return [];
    }
  })(),
  chatMessages: [
    {
      role: "ai",
      text: "नमस्कार! मी CropMind Expert AI आहे. शेतीबद्दल काहीही विचारा! 🌾",
    },
  ],
  chatInput: "",
  selectedLesson: null,
  searchingLocation: false,
  showLocationSearch: false,
  locationQuery: "",
  chatLoading: false,
};

// ── HELPERS ───────────────────────────────────────────
function t(key) {
  return (translations[state.lang] || translations.mr)[key] || key;
}
function cropName(id) {
  const c = CROPS.find((x) => x.id === id);
  if (!c) return id;
  return state.lang === "mr"
    ? c.nameMr
    : state.lang === "hi"
      ? c.nameHi
      : state.lang === "ta"
        ? c.nameTa
        : c.name;
}
function wIcon(code) {
  if (code === 0) return "☀️";
  if (code <= 3) return "⛅";
  if (code <= 48) return "🌫️";
  if (code <= 67) return "🌧️";
  if (code <= 77) return "❄️";
  return "⛈️";
}
function greeting() {
  const h = new Date().getHours();
  return h < 12
    ? t("goodMorning")
    : h < 17
      ? t("goodAfternoon")
      : t("goodEvening");
}
function esc(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ── RENDER ────
function render() {
  // Save focused element and scroll position
  const activeId = document.activeElement?.id;
  const scrollY = window.scrollY;

  const root = document.getElementById("root");
  root.innerHTML = buildApp();
  bindEvents();

  // Restore focus and scroll
  if (activeId) {
    const el = document.getElementById(activeId);
    if (el) {
      el.focus();
      // Restore cursor to end for text inputs
      if (el.tagName === "INPUT" || el.tagName === "TEXTAREA") {
        const len = el.value.length;
        el.setSelectionRange(len, len);
      }
    }
  }
  window.scrollTo(0, scrollY);
}

function setState(updates) {
  // Save textarea value before re-render
  const sym = document.getElementById("symptoms-input");
  if (sym && !updates.hasOwnProperty("symptoms")) {
    state.symptoms = sym.value;
  }
  const chatIn = document.getElementById("chat-input");
  if (chatIn && !updates.hasOwnProperty("chatInput")) {
    state.chatInput = chatIn.value;
  }
  const apiIn = document.getElementById("api-key-input");
  if (apiIn && !updates.hasOwnProperty("apiKey")) {
    state.apiKey = apiIn.value;
  }
  Object.assign(state, updates);
  render();
}

// ── WEATHER ───────────────────────────────────────────
async function loadWeather(lat, lon, cityOverride) {
  try {
    const res = await fetch(`/api/weather?lat=${lat}&lon=${lon}`);
    const data = await res.json();
    if (data.error || !data.current) throw new Error("Bad weather data");
    state.weather = data;
    if (cityOverride) {
      state.cityName = cityOverride;
    } else {
      try {
        const cityRes = await fetch(`/api/city?lat=${lat}&lon=${lon}`);
        const cityData = await cityRes.json();
        state.cityName = cityData.city || "India";
      } catch {
        state.cityName = "India";
      }
    }
    localStorage.setItem("cm_weather", JSON.stringify(data));
    localStorage.setItem("cm_city", state.cityName);
    render();
    return true;
  } catch (e) {
    console.log("Weather fetch failed:", e.message);
    return false;
  }
}

async function initWeather() {
  // Try GPS first
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const ok = await loadWeather(pos.coords.latitude, pos.coords.longitude);
        if (!ok) await loadByIP();
      },
      async () => {
        await loadByIP();
      },
      { timeout: 8000, maximumAge: 300000 },
    );
  } else {
    await loadByIP();
  }
}

async function loadByIP() {
  try {
    const r = await fetch("/api/location");
    const d = await r.json();
    if (d.latitude && d.longitude) {
      await loadWeather(d.latitude, d.longitude, d.city || d.region || "India");
      return true;
    }
  } catch {}
  // Last fallback - demo weather so UI is not blank
  state.weather = {
    current: {
      temperature_2m: 32,
      relative_humidity_2m: 68,
      precipitation: 0,
      wind_speed_10m: 12,
      apparent_temperature: 34,
      weather_code: 1,
    },
  };
  state.cityName = "India";
  render();
  return false;
}

// Search weather by location name
async function searchLocation() {
  const q = state.locationQuery.trim();
  if (!q) return;
  setState({ searchingLocation: true });
  try {
    // Use Open-Meteo geocoding API (free, no key)
    const geoRes = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=1&language=en&format=json`,
    );
    const geoData = await geoRes.json();
    if (geoData.results && geoData.results.length > 0) {
      const loc = geoData.results[0];
      const cityName =
        loc.name +
        (loc.admin1 ? ", " + loc.admin1 : "") +
        (loc.country ? ", " + loc.country : "");
      await loadWeather(loc.latitude, loc.longitude, cityName);
      setState({ searchingLocation: false, locationQuery: "" });
    } else {
      alert("Location not found. Try a different city name.");
      setState({ searchingLocation: false });
    }
  } catch (e) {
    alert("Search failed. Check internet connection.");
    setState({ searchingLocation: false });
  }
}

// ── AI DIAGNOSIS ────
async function runDiagnosis() {
  // Always read latest value from DOM first
  const symInput = document.getElementById("symptoms-input");
  if (symInput) state.symptoms = symInput.value;

  if (!state.symptoms.trim() && !state.photoBase64) {
    alert(
      state.lang === "mr"
        ? "कृपया लक्षणे लिहा किंवा फोटो अपलोड करा"
        : state.lang === "hi"
          ? "कृपया लक्षण लिखें या फोटो अपलोड करें"
          : "Please describe symptoms or upload a photo",
    );
    return;
  }
  if (!state.apiKey) {
    alert(
      state.lang === "mr"
        ? "Settings मध्ये Gemini API Key टाका"
        : state.lang === "hi"
          ? "Settings में API Key डालें"
          : "Please add your Gemini API Key in Settings first",
    );
    setState({ diagnosis: { error: true } });
    return;
  }
  // Update UI for loading WITHOUT full re-render (preserves textarea)
  state.diagnosing = true;
  state.diagnosis = null;
  const abtn = document.querySelector('.cm-btn[onclick="runDiagnosis()"]');
  if (abtn) {
    abtn.disabled = true;
    abtn.innerHTML =
      "<div class='cm-dot'></div><div class='cm-dot'></div><div class='cm-dot'></div>";
    abtn.style.opacity = "0.7";
  }
  // Show loading text
  let loadDiv = document.getElementById("diag-loading");
  if (!loadDiv) {
    loadDiv = document.createElement("div");
    loadDiv.id = "diag-loading";
    loadDiv.style.cssText =
      "text-align:center;color:#2E7D32;font-size:0.85rem;margin-top:12px;font-weight:600;padding:8px";
    if (abtn) abtn.insertAdjacentElement("afterend", loadDiv);
  }
  loadDiv.textContent =
    state.lang === "mr"
      ? "⏳ तुमच्या पिकाचे विश्लेषण होत आहे..."
      : state.lang === "hi"
        ? "⏳ फसल का विश्लेषण हो रहा है..."
        : "⏳ Analyzing your crop...";

  const w = state.weather?.current;
  const langName = { mr: "Marathi", hi: "Hindi", ta: "Tamil", en: "English" }[
    state.lang
  ];
  const prompt = `You are an expert agricultural scientist specializing in Indian farming.
Crop: ${state.selectedCrop} | Soil: ${state.selectedSoil} | Location: ${state.cityName || "Maharashtra, India"}
Weather: ${w ? `${w.temperature_2m}°C, Humidity ${w.relative_humidity_2m}%, Rain ${w.precipitation}mm` : "Unknown"}
Farmer symptoms: ${state.symptoms}
${state.photoBase64 ? "Photo of crop attached." : ""}

Provide diagnosis in ${langName} language in this EXACT JSON format (no markdown):
{
  "disease": "Disease name",
  "confidence": "85%",
  "cause": "Brief cause explanation",
  "treatment": ["Step 1", "Step 2", "Step 3", "Step 4"],
  "prevention": "Prevention tip",
  "beforeEmoji": "🍂",
  "afterEmoji": "🌿",
  "beforeDesc": "Describe sick crop",
  "afterDesc": "Describe healthy crop after treatment",
  "recommendedProducts": ["fungicide", "fertilizer"]
}`;

  try {
    const res = await fetch("/api/diagnose", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        apiKey: state.apiKey,
        prompt,
        imageBase64: state.photoBase64,
        mimeType: state.photoMimeType || "image/jpeg",
        selectedCrop: state.selectedCrop,
      }),
    });
    const data = await res.json();

    // Handle Gemini API errors from server
    if (data.error || data.geminiError) {
      const errMsg = data.geminiError || data.error;
      state.diagnosis = { error: true, message: errMsg };
      state.diagnosing = false;
      render();
      return;
    }

    // Extract text from Gemini response
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
    if (!text) {
      state.diagnosis = {
        error: true,
        message: "No response from AI. Check your API key.",
      };
      state.diagnosing = false;
      render();
      return;
    }

    // Parse JSON from response
    let parsed;
    try {
      const clean = text.replace(/```json|```/g, "").trim();
      parsed = JSON.parse(clean);
    } catch (parseErr) {
      // If JSON parse fails, extract what we can from plain text
      parsed = {
        disease: state.lang === "mr" ? "रोग ओळखला" : "Disease Identified",
        confidence: "80%",
        cause: text.substring(0, 200),
        treatment: [text.substring(0, 500)],
        prevention:
          state.lang === "mr"
            ? "तज्ञांशी सल्ला घ्या"
            : "Consult local agriculture expert",
        beforeEmoji: "🍂",
        afterEmoji: "🌿",
        beforeDesc: state.lang === "mr" ? "संक्रमित पीक" : "Infected crop",
        afterDesc:
          state.lang === "mr"
            ? "उपचारानंतर निरोगी पीक"
            : "Healthy crop after treatment",
        recommendedProducts: ["fungicide", "fertilizer"],
      };
    }

    const matched = PRODUCTS.filter((p) =>
      (parsed.recommendedProducts || []).some(
        (rp) =>
          p.name.toLowerCase().includes(rp.toLowerCase()) ||
          p.forDisease?.some((d) => parsed.disease?.toLowerCase().includes(d)),
      ),
    ).slice(0, 4);

    state.diagnosis = parsed;
    state.diagnosing = false;
    state.recommendedProducts = matched.length ? matched : PRODUCTS.slice(0, 3);
    localStorage.setItem("cm_last_diagnosis", JSON.stringify(parsed));
    render(); // Full render only when result is ready
  } catch (e) {
    state.diagnosis = {
      error: true,
      message: "Connection failed: " + e.message,
    };
    state.diagnosing = false;
    render();
  }
}

// ── AI CHAT ───────
async function sendChat() {
  if (!state.chatInput.trim()) return;
  const msg = state.chatInput;
  const newMsgs = [...state.chatMessages, { role: "user", text: msg }];
  setState({ chatMessages: newMsgs, chatInput: "", chatLoading: true });

  if (!state.apiKey) {
    setState({
      chatMessages: [...newMsgs, { role: "ai", text: t("noApiKey") }],
      chatLoading: false,
    });
    return;
  }
  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        apiKey: state.apiKey,
        message: msg,
        lang: state.lang,
      }),
    });
    const data = await res.json();
    const reply = data.candidates?.[0]?.content?.parts?.[0]?.text || t("error");
    setState({
      chatMessages: [...newMsgs, { role: "ai", text: reply }],
      chatLoading: false,
    });
  } catch {
    setState({
      chatMessages: [...newMsgs, { role: "ai", text: t("error") }],
      chatLoading: false,
    });
  }
}

// ── VOICE INPUT ───────
function startVoice() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) {
    alert(
      state.lang === "mr"
        ? "तुमचा browser voice input support करत नाही. Chrome वापरा."
        : "Your browser doesn't support voice input. Please use Chrome.",
    );
    return;
  }
  // If already listening, stop
  if (state._recognition) {
    state._recognition.stop();
    state._recognition = null;
    state.listening = false;
    const vbtn = document.querySelector(".cm-voice-btn");
    if (vbtn) {
      vbtn.classList.remove("recording");
      vbtn.innerHTML =
        '<span style="font-size:1.3rem">🎙️</span> ' +
        (state.lang === "mr"
          ? "आवाजात सांगा"
          : state.lang === "hi"
            ? "आवाज में बोलें"
            : "Voice Input");
    }
    return;
  }
  const r = new SR();
  r.lang =
    state.lang === "mr"
      ? "mr-IN"
      : state.lang === "hi"
        ? "hi-IN"
        : state.lang === "ta"
          ? "ta-IN"
          : "en-IN";
  r.continuous = false;
  r.interimResults = false;
  r.onresult = (e) => {
    const transcript = e.results[0][0].transcript;
    state.symptoms = transcript;
    state.listening = false;
    state._recognition = null;
    // Update textarea directly - no full re-render needed
    const sym = document.getElementById("symptoms-input");
    if (sym) {
      sym.value = transcript;
      sym.style.borderColor = "#4CAF50";
    }
    // Update voice button
    const vbtn = document.querySelector(".cm-voice-btn");
    if (vbtn) {
      vbtn.classList.remove("recording");
      vbtn.innerHTML =
        '<span style="font-size:1.3rem">🎙️</span> ' +
        (state.lang === "mr"
          ? "आवाजात सांगा"
          : state.lang === "hi"
            ? "आवाज में बोलें"
            : "Voice Input");
    }
    // Enable analyze button
    const abtn = document.querySelector('.cm-btn[onclick="runDiagnosis()"]');
    if (abtn) abtn.removeAttribute("disabled");
  };
  r.onerror = (e) => {
    console.log("Voice error:", e.error);
    state.listening = false;
    state._recognition = null;
    const vbtn = document.querySelector(".cm-voice-btn");
    if (vbtn) {
      vbtn.classList.remove("recording");
      vbtn.innerHTML =
        '<span style="font-size:1.3rem">🎙️</span> ' +
        (state.lang === "mr" ? "आवाजात सांगा" : "Voice Input");
    }
    if (e.error === "not-allowed") {
      alert(
        state.lang === "mr"
          ? "Microphone access नाकारला. Browser settings मध्ये allow करा."
          : state.lang === "hi"
            ? "माइक्रोफोन अनुमति नकार दी। ब्राउज़र सेटिंग में Allow करें।"
            : "Microphone access denied. Please allow it in browser settings.",
      );
    }
  };
  r.onend = () => {
    if (state.listening) {
      state.listening = false;
      state._recognition = null;
      const vbtn = document.querySelector(".cm-voice-btn");
      if (vbtn) {
        vbtn.classList.remove("recording");
        vbtn.innerHTML =
          '<span style="font-size:1.3rem">🎙️</span> ' +
          (state.lang === "mr" ? "आवाजात सांगा" : "Voice Input");
      }
    }
  };
  state._recognition = r;
  state.listening = true;
  // Update button directly without full re-render
  const vbtn = document.querySelector(".cm-voice-btn");
  if (vbtn) {
    vbtn.classList.add("recording");
    vbtn.innerHTML =
      '<span style="font-size:1.3rem">🔴</span> ' +
      (state.lang === "mr"
        ? "ऐकत आहे... (थांबवण्यासाठी दाबा)"
        : state.lang === "hi"
          ? "सुन रहा है..."
          : "Listening... (tap to stop)");
  }
  r.start();
}

// ── PHOTO UPLOAD ────
function handlePhoto(file) {
  if (!file) return;
  const url = URL.createObjectURL(file);
  const reader = new FileReader();
  reader.onload = (ev) => {
    const full = ev.target.result;
    const match = full.match(/^data:(image\/[a-zA-Z+]+);base64,/);
    const mimeType = match ? match[1] : "image/jpeg";
    const base64Data = full.split(",")[1];
    setState({ photo: url, photoBase64: base64Data, photoMimeType: mimeType });
  };
  reader.readAsDataURL(file);
}

// ── WEATHER TIP ─────
function weatherTip() {
  if (!state.weather) return "";
  const {
    temperature_2m: tmp,
    relative_humidity_2m: hum,
    precipitation: rain,
  } = state.weather.current;
  const l = state.lang;
  if (tmp > 35)
    return l === "mr"
      ? "उष्णता जास्त. पिकांना लवकर सकाळी पाणी द्या."
      : l === "hi"
        ? "अत्यधिक गर्मी। सुबह जल्दी पानी दें।"
        : "High heat. Water crops early morning.";
  if (hum > 80)
    return l === "mr"
      ? "आर्द्रता जास्त - बुरशीजन्य रोगाची शक्यता. बुरशीनाशक फवारणी करा."
      : l === "hi"
        ? "अधिक नमी - फंगल खतरा। फफूंदनाशक स्प्रे करें।"
        : "High humidity = fungal risk. Spray fungicide.";
  if (rain > 10)
    return l === "mr"
      ? "पाऊस झाला. शेताचा निचरा तपासा."
      : l === "hi"
        ? "बारिश हुई। खेत जल निकासी जांचें।"
        : "Heavy rain. Ensure proper field drainage.";
  return l === "mr"
    ? "हवामान शेतीसाठी चांगले आहे. नियमित निरीक्षण करा."
    : l === "hi"
      ? "मौसम खेती के लिए अच्छा है।"
      : "Good weather for farming. Monitor crops regularly.";
}

// ── HTML BUILDERS ──────

function buildWeather() {
  const w = state.weather;
  if (!w)
    return `<div class="cm-loading"><div class="cm-dot"></div><div class="cm-dot"></div><div class="cm-dot"></div><span style="color:rgba(255,255,255,0.8);font-size:0.85rem;margin-left:8px">${t("loadingWeather")}</span></div>`;
  const c = w.current;
  return `
    <div class="cm-weather-main">
      <div>
        <div class="cm-weather-location">  ${esc(state.cityName)}</div>
        <div class="cm-weather-temp">${Math.round(c.temperature_2m)}°C</div>
        <div class="cm-weather-desc">${t("feelsLike")} ${Math.round(c.apparent_temperature)}°C</div>
      </div>
      <div class="cm-weather-emoji">${wIcon(c.weather_code)}</div>
    </div>
    <div class="cm-weather-grid">
      <div class="cm-weather-stat"><div class="cm-weather-stat-val">${c.relative_humidity_2m}%</div><div class="cm-weather-stat-label">${t("humidity")}</div></div>
      <div class="cm-weather-stat"><div class="cm-weather-stat-val">${c.precipitation}mm</div><div class="cm-weather-stat-label">${t("rainfall")}</div></div>
      <div class="cm-weather-stat"><div class="cm-weather-stat-val">${Math.round(c.wind_speed_10m)}km/h</div><div class="cm-weather-stat-label">${t("wind")}</div></div>
    </div>
    <div class="cm-weather-tip">💡 ${weatherTip()}</div>`;
}

function buildCropGrid(selectedId, clickHandler) {
  return CROPS.slice(0, 8)
    .map(
      (c) => `
    <div class="cm-crop-btn ${selectedId === c.id ? "selected" : ""}" onclick="${clickHandler}('${c.id}')">
      <div class="crop-icon">${c.icon}</div>
      <div class="crop-name">${esc(state.lang === "mr" ? c.nameMr : state.lang === "hi" ? c.nameHi : c.name)}</div>
    </div>`,
    )
    .join("");
}

function buildSoilRow(selected, clickHandler) {
  const soils = [
    ["black", "⚫"],
    ["red", "🔴"],
    ["sandy", "🟡"],
    ["loamy", "🟤"],
  ];
  return soils
    .map(
      ([s, e]) => `
    <div class="cm-soil-btn ${selected === s ? "selected" : ""}" onclick="${clickHandler}('${s}')">${e} ${t(s)}</div>`,
    )
    .join("");
}

function buildDiagnosis() {
  const d = state.diagnosis;
  if (!d) return "";
  if (d.error) {
    const errMsg = d.message || "";
    let hint = "";
    if (errMsg.includes("API_KEY_INVALID") || errMsg.includes("invalid"))
      hint =
        state.lang === "mr"
          ? " - चुकीची API Key. Settings मध्ये नवीन key टाका."
          : " - Invalid API Key. Add correct key in Settings.";
    else if (errMsg.includes("PERMISSION") || errMsg.includes("permission"))
      hint =
        state.lang === "mr"
          ? " - Gemini API enabled नाही. aistudio.google.com वरून नवीन key घ्या."
          : " - API not enabled. Get new key from aistudio.google.com";
    else if (!state.apiKey)
      hint =
        state.lang === "mr"
          ? " - Settings मध्ये Gemini API Key टाका."
          : " - Add Gemini API Key in Settings.";
    return `<div style="background:#FFEBEE;border-radius:12px;padding:16px;margin-top:12px;font-size:0.85rem;color:#C62828;text-align:center;line-height:1.6">
      ⚠️ ${state.lang === "mr" ? "AI निदान अयशस्वी" : state.lang === "hi" ? "AI निदान विफल" : "AI Diagnosis Failed"}${hint}
      ${errMsg ? `<div style="font-size:0.75rem;margin-top:6px;opacity:0.8">${esc(errMsg.substring(0, 100))}</div>` : ""}
      <div style="margin-top:10px"><button onclick="window.open('https://aistudio.google.com','_blank')" style="background:#1565C0;border:none;border-radius:8px;padding:8px 14px;color:#fff;cursor:pointer;font-size:0.8rem">🔑 Get Free API Key</button></div>
    </div>`;
  }
  return `
    <div style="margin-top:16px">
      <div class="cm-card-title-dark" style="padding:0 0 8px">${t("diagnosisResult")}</div>
      <div class="cm-diagnosis-card">
        <div class="cm-diagnosis-header">
          <div class="cm-diagnosis-disease">🦠 ${esc(d.disease)}</div>
          <div class="cm-diagnosis-confidence">✓ ${t("confidence")}: ${esc(d.confidence)}</div>
          ${d.cause ? `<div style="font-size:0.8rem;color:rgba(255,255,255,0.85);margin-top:8px">${esc(d.cause)}</div>` : ""}
        </div>
        <div class="cm-diagnosis-body">
          <div class="cm-card-title-dark">${t("treatment")}</div>
          ${(d.treatment || [])
            .map(
              (step, i) => `
            <div class="cm-treatment-step">
              <div class="cm-step-num">${i + 1}</div>
              <div class="cm-step-text">${esc(step)}</div>
            </div>`,
            )
            .join("")}
          ${d.prevention ? `<div style="background:#E8F5E9;border-radius:10px;padding:10px 12px;margin-top:12px;font-size:0.82rem;color:#1B5E20;border-left:3px solid #4CAF50">🛡️ ${esc(d.prevention)}</div>` : ""}
        </div>
      </div>
      <div class="cm-card">
        <div class="cm-card-title-dark">${t("beforeAfter")}</div>
        <div class="cm-before-after">
          <div class="cm-ba-card cm-ba-before">
            <div class="cm-ba-emoji">${d.beforeEmoji || "🍂"}</div>
            <div class="cm-ba-label">${t("before")}</div>
            <div class="cm-ba-desc">${esc(d.beforeDesc || "")}</div>
          </div>
          <div class="cm-ba-card cm-ba-after">
            <div class="cm-ba-emoji">${d.afterEmoji || "🌿"}</div>
            <div class="cm-ba-label">${t("after")}</div>
            <div class="cm-ba-desc">${esc(d.afterDesc || "")}</div>
          </div>
        </div>
      </div>
      <button class="cm-btn cm-btn-orange" onclick="gotoStore()">🛒 ${t("buyProducts")}</button>
    </div>`;
}

function buildCropDetail(c) {
  return `
    <div class="cm-crop-detail">
      <div class="cm-crop-detail-header">
        <button class="cm-back-btn" onclick="setState({selectedCropDetail:null})">← ${state.lang === "mr" ? "मागे" : "Back"}</button>
        <div class="cm-crop-detail-icon">${c.icon}</div>
        <div class="cm-crop-detail-name">${esc(state.lang === "mr" ? c.nameMr : state.lang === "hi" ? c.nameHi : c.name)}</div>
        <div class="cm-crop-detail-sub">${esc(c.description || "")}</div>
      </div>
      <div style="padding:16px">
        <div class="cm-price-row" style="margin-bottom:14px">
          <div class="cm-price-card cm-price-mandi"><div class="cm-price-label">📊 ${t("mandiPrice")}</div><div class="cm-price-value">${esc(c.mandiPrice)}</div></div>
          <div class="cm-price-card cm-price-msp"><div class="cm-price-label">🏛️ ${t("msp")}</div><div class="cm-price-value">${esc(c.msp)}</div></div>
        </div>
        <div class="cm-info-grid">
          <div class="cm-info-item"><div class="cm-info-label">📅 ${t("season")}</div><div class="cm-info-value">${esc(c.season)}</div></div>
          <div class="cm-info-item"><div class="cm-info-label">💧 ${t("water")}</div><div class="cm-info-value">${esc(c.water)}</div></div>
          <div class="cm-info-item"><div class="cm-info-label">🌡️ Temp</div><div class="cm-info-value">${esc(c.temp)}</div></div>
          <div class="cm-info-item"><div class="cm-info-label">🪨 ${t("soilType")}</div><div class="cm-info-value">${esc(c.soilType)}</div></div>
        </div>
        <div class="cm-card">
          <div class="cm-card-title-dark">🐛 ${t("diseases")}</div>
          <div class="cm-disease-tags">${(c.diseases || []).map((d) => `<span class="cm-disease-tag">${esc(d)}</span>`).join("")}</div>
        </div>
        <div class="cm-card">
          <div class="cm-card-title-dark">🧪 ${t("fertilizer")}</div>
          <div style="font-size:0.85rem;color:#333;line-height:1.6">${esc(c.fertilizer || "")}</div>
        </div>
        <div class="cm-card">
          <div class="cm-card-title-dark">📅 ${t("calendar")}</div>
          <ul class="cm-calendar-list">${(c.calendar || []).map((item) => `<li class="cm-calendar-item"><div class="cm-calendar-dot"></div>${esc(item)}</li>`).join("")}</ul>
        </div>
        <div class="cm-card">
          <div class="cm-card-title-dark">💡 ${t("proTips")}</div>
          <div style="font-size:0.85rem;color:#333;line-height:1.6">${esc(c.proTips || "")}</div>
        </div>
        <button class="cm-btn" onclick="gotoDoctorWithCrop('${c.id}')">🔬 ${state.lang === "mr" ? "या पिकाचे निदान करा" : state.lang === "hi" ? "इस फसल का निदान" : "Diagnose this crop"}</button>
      </div>
    </div>`;
}

// ── SCREEN BUILDERS ───────────────────────────────────

function buildHomeScreen() {
  const p = state.profile;
  return `
    <div class="cm-section">
      <div class="cm-greeting">
        <div class="cm-greeting-time">🌾 ${greeting()}</div>
        <div class="cm-greeting-name">${esc(p.name || (state.lang === "mr" ? "शेतकरी मित्र" : state.lang === "hi" ? "किसान मित्र" : "Farmer Friend"))} 👋</div>
        <div class="cm-greeting-sub">📍 ${esc(state.cityName || "India")} • ${esc(cropName(p.crop))}</div>
      </div>

      <div class="cm-card cm-card-green">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:9px">
          <div class="cm-card-title" style="margin-bottom:0">🌦 ${t("weatherNow")}</div>
          <button onclick="toggleLocationSearch()" style="background:rgba(255,255,255,0.2);border:none;border-radius:12px;padding:4px 10px;color:#fff;font-size:0.75rem;cursor:pointer;font-family:inherit;font-weight:600">📍 ${state.lang === "mr" ? "जागा बदला" : state.lang === "hi" ? "जगह बदलें" : "Change Location"}</button>
        </div>
        ${
          state.showLocationSearch
            ? `
          <div style="display:flex;gap:8px;margin-bottom:12px">
            <input id="loc-search" type="text" placeholder="${state.lang === "mr" ? "शहर/जिल्हा लिहा..." : state.lang === "hi" ? "शहर/जिला लिखें..." : "Enter city/district..."}" value="${esc(state.locationQuery)}" style="flex:1;background:rgba(255,255,255,0.9);border:none;border-radius:10px;padding:9px 12px;font-family:inherit;font-size:0.88rem;color:#1A3C20;outline:none">
            <button onclick="doLocationSearch()" style="background:#FF8F00;border:none;border-radius:10px;padding:9px 14px;color:#fff;font-family:inherit;font-size:0.85rem;font-weight:700;cursor:pointer;white-space:nowrap">
              ${state.searchingLocation ? "⏳" : "🔍 " + (state.lang === "mr" ? "शोधा" : state.lang === "hi" ? "खोजें" : "Search")}
            </button>
          </div>`
            : ""
        }
        ${buildWeather()}
      </div>

      <div class="cm-card">
        <div class="cm-card-title-dark">👨‍🌾 ${t("farmerProfile")}</div>
        <div class="cm-form-group">
          <label class="cm-label">${t("yourName")}</label>
          <input class="cm-input" id="inp-name" value="${esc(p.name)}" placeholder="${state.lang === "mr" ? "राजेश पाटील" : "Rajesh Patil"}">
        </div>
        <div class="cm-form-group">
          <label class="cm-label">${t("village")}</label>
          <input class="cm-input" id="inp-village" value="${esc(p.village)}" placeholder="${state.lang === "mr" ? "नाशिक, महाराष्ट्र" : "Nashik, Maharashtra"}">
        </div>
        <div class="cm-profile-grid">
          <div class="cm-form-group">
            <label class="cm-label">${t("selectCrop")}</label>
            <select class="cm-input cm-select" id="sel-crop">
              ${CROPS.map((c) => `<option value="${c.id}" ${p.crop === c.id ? "selected" : ""}>${c.icon} ${esc(state.lang === "mr" ? c.nameMr : state.lang === "hi" ? c.nameHi : c.name)}</option>`).join("")}
            </select>
          </div>
          <div class="cm-form-group">
            <label class="cm-label">${t("selectSoil")}</label>
            <select class="cm-input cm-select" id="sel-soil">
              <option value="black" ${p.soil === "black" ? "selected" : ""}>${t("black")}</option>
              <option value="red" ${p.soil === "red" ? "selected" : ""}>${t("red")}</option>
              <option value="sandy" ${p.soil === "sandy" ? "selected" : ""}>${t("sandy")}</option>
              <option value="loamy" ${p.soil === "loamy" ? "selected" : ""}>${t("loamy")}</option>
            </select>
          </div>
        </div>
        <button class="cm-btn" onclick="saveProfile()">💾 ${t("saveProfile")}</button>
        ${state.profileSaved ? `<div class="cm-success-toast">✅ ${t("profileSaved")}</div>` : ""}
      </div>

      <div class="cm-card">
        <div class="cm-card-title-dark">🏆 ${t("impactTitle")}</div>
        <div class="cm-impact-grid">
          <div class="cm-impact-item"><div class="cm-impact-num">12,400</div><div class="cm-impact-label">${t("farmersHelped")}</div></div>
          <div class="cm-impact-item"><div class="cm-impact-num">₹3.2Cr</div><div class="cm-impact-label">${t("moneySaved")}</div></div>
          <div class="cm-impact-item"><div class="cm-impact-num">8,900</div><div class="cm-impact-label">${t("diseasesDetected")}</div></div>
        </div>
      </div>
    </div>`;
}

function buildDoctorScreen() {
  const photoHTML = state.photo
    ? `<div style="position:relative">
        <img src="${state.photo}" style="width:100%;border-radius:12px;max-height:200px;object-fit:cover;display:block">
        <div style="position:absolute;top:8px;right:8px;background:rgba(46,125,50,0.9);border-radius:8px;padding:4px 10px;color:#fff;font-size:0.75rem;font-weight:700">✓ ${state.lang === "mr" ? "फोटो अपलोड" : state.lang === "hi" ? "फोटो अपलोड" : "Uploaded"}</div>
        <div onclick="clearPhoto()" style="position:absolute;top:8px;left:8px;background:rgba(198,40,40,0.9);border-radius:8px;padding:4px 10px;color:#fff;font-size:0.75rem;font-weight:700;cursor:pointer">✕ ${state.lang === "mr" ? "बदला" : state.lang === "hi" ? "बदलें" : "Change"}</div>
       </div>`
    : `<div style="border:2px dashed #A5D6A7;border-radius:14px;padding:24px;text-align:center;background:#F1F8E9;cursor:pointer" onclick="document.getElementById('photo-input').click()">
        <div style="font-size:2.8rem;margin-bottom:8px">📷</div>
        <div style="font-size:0.95rem;font-weight:700;color:#2E7D32;margin-bottom:4px">${state.lang === "mr" ? "पिकाचा फोटो काढा" : state.lang === "hi" ? "फसल की फोटो लें" : "Take Crop Photo"}</div>
        <div style="font-size:0.78rem;color:#6B8F72;margin-bottom:12px">${state.lang === "mr" ? "किंवा गॅलरीतून निवडा" : state.lang === "hi" ? "या गैलरी से चुनें" : "or choose from gallery"}</div>
        <div style="background:#2E7D32;color:#fff;border-radius:10px;padding:10px 24px;display:inline-block;font-size:0.88rem;font-weight:700">📷 ${state.lang === "mr" ? "फोटो अपलोड करा" : state.lang === "hi" ? "फोटो अपलोड करें" : "Upload Photo"}</div>
       </div>`;

  return `
    <div class="cm-section-header">
      <div class="cm-section-title">🔬 ${t("cropDoctorTitle")}</div>
      <div class="cm-section-sub">${t("cropDoctorSub")}</div>
    </div>
    <div class="cm-section">
      ${!state.apiKey ? `<div class="cm-no-api">⚠️ ${t("noApiKey")}</div><div style="height:8px"></div>` : ""}

      <div class="cm-card">
        <div class="cm-card-title-dark">🌾 ${t("selectCrop")}</div>
        <div class="cm-crop-grid">${buildCropGrid(state.selectedCrop, "selectDiagCrop")}</div>
      </div>

      <div class="cm-card">
        <div class="cm-card-title-dark">🪨 ${t("selectSoil")}</div>
        <div class="cm-soil-row">${buildSoilRow(state.selectedSoil, "selectDiagSoil")}</div>
      </div>

      <div class="cm-card">
        <div class="cm-card-title-dark">💬 ${t("describeProblem")}</div>
        <button class="cm-voice-btn ${state.listening ? "recording" : ""}" onclick="startVoice()" style="border:none">
          <span style="font-size:1.3rem">${state.listening ? "🔴" : "🎙️"}</span>
          ${
            state.listening
              ? state.lang === "mr"
                ? "ऐकत आहे... (थांबवण्यासाठी दाबा)"
                : state.lang === "hi"
                  ? "सुन रहा है... (रोकने के लिए दबाएं)"
                  : "Listening... (tap to stop)"
              : state.lang === "mr"
                ? "आवाजात सांगा"
                : state.lang === "hi"
                  ? "आवाज में बोलें"
                  : t("voiceInput")
          }
        </button>
        <textarea class="cm-input cm-textarea" id="symptoms-input" placeholder="${state.lang === "mr" ? "उदा. पानावर पिवळे डाग, पाने गळत आहेत..." : state.lang === "hi" ? "उदा. पत्तियों पर पीले धब्बे, पत्तियां गिर रही हैं..." : "e.g. Yellow spots on leaves, falling leaves, wilting..."}" oninput="state.symptoms=this.value">${esc(state.symptoms)}</textarea>
      </div>

      <div class="cm-card">
        <div class="cm-card-title-dark">📸 ${t("uploadPhoto")}</div>
        <input type="file" id="photo-input" accept="image/*" capture="environment" style="display:none" onchange="onPhotoChange(this)">
        ${photoHTML}
      </div>

      <button class="cm-btn" onclick="runDiagnosis()" ${state.diagnosing ? "disabled" : ""} style="opacity:${state.diagnosing ? 0.7 : 1}">
        ${
          state.diagnosing
            ? `<div class="cm-dot"></div><div class="cm-dot"></div><div class="cm-dot"></div>`
            : `🔍 ${t("analyzeNow")}`
        }
      </button>
      ${state.diagnosing ? `<div style="text-align:center;color:#2E7D32;font-size:0.85rem;margin-top:12px;font-weight:600">${t("diagnosing")}</div>` : ""}
      ${buildDiagnosis()}
    </div>`;
}

function buildStoreScreen() {
  const filters = [
    ["all", t("allProducts")],
    ["recommended", t("recommended")],
    ["fertilizer", "🧪 Fertilizer"],
    ["fungicide", "🔬 Fungicide"],
    ["insecticide", "🐛 Insecticide"],
    ["bio", "🌿 Bio"],
    ["equipment", "⚙️ Equipment"],
  ];
  const prods =
    state.storeFilter === "all"
      ? PRODUCTS
      : state.storeFilter === "recommended"
        ? state.recommendedProducts
        : PRODUCTS.filter((p) => p.category === state.storeFilter);

  return `
    <div class="cm-section-header">
      <div class="cm-section-title">🛒 ${t("storeTitle")}</div>
      <div class="cm-section-sub">Maharashtra Agri Store</div>
    </div>
    <div class="cm-filter-row">
      ${filters.map(([k, v]) => `<div class="cm-filter-chip ${state.storeFilter === k ? "active" : ""}" onclick="setStoreFilter('${k}')">${v}</div>`).join("")}
    </div>
    ${
      state.storeFilter === "recommended" &&
      state.recommendedProducts.length === 0
        ? `<div style="padding:20px 16px;text-align:center;color:#6B8F72;font-size:0.85rem">${state.lang === "mr" ? "पहिले Crop Doctor मध्ये निदान करा" : "Run Crop Doctor diagnosis first"}</div>`
        : ""
    }
    ${prods
      .map(
        (p) => `
      <div class="cm-product-card">
        <div class="cm-product-icon-wrap">${p.icon}</div>
        <div class="cm-product-info">
          ${state.storeFilter === "recommended" || state.recommendedProducts.find((r) => r.id === p.id) ? `<div class="cm-recommended-badge">⭐  ${t("recommended")}</div>` : ""}
          <div class="cm-product-name">${esc(state.lang === "mr" ? p.nameMr : state.lang === "hi" ? p.nameHi : p.name)}</div>
          <div class="cm-product-desc">${esc(p.description)}</div>
          <div class="cm-product-bottom">
            <div>
              <div class="cm-product-price">${esc(p.price)}</div>
              <div class="cm-product-meta">⭐ ${p.rating} • ${p.sold}</div>
            </div>
            <a href="${p.buyLink}" target="_blank" rel="noopener noreferrer" style="text-decoration:none">
              <button class="cm-buy-btn">🛍️ ${t("buyNow")}</button>
            </a>
          </div>
        </div>
      </div>`,
      )
      .join("")}`;
}

function buildEncyclopediaScreen() {
  if (state.selectedCropDetail)
    return buildCropDetail(state.selectedCropDetail);
  const filtered = CROPS.filter(
    (c) =>
      c.name.toLowerCase().includes(state.cropSearch.toLowerCase()) ||
      c.nameMr.includes(state.cropSearch) ||
      c.nameHi.includes(state.cropSearch),
  );
  return `
    <div class="cm-section-header">
      <div class="cm-section-title">📖 ${t("encyclopediaTitle")}</div>
    </div>
    <div class="cm-search-wrap">
      <span class="cm-search-icon">🔍</span>
      <input class="cm-input cm-search" id="crop-search" value="${esc(state.cropSearch)}" placeholder="${t("searchCrop")}">
    </div>
    ${filtered
      .map(
        (c) => `
      <div class="cm-crop-list-item" onclick="showCropDetail('${c.id}')">
        <div class="cm-crop-list-icon">${c.icon}</div>
        <div class="cm-crop-list-info">
          <div class="cm-crop-list-name">${esc(state.lang === "mr" ? c.nameMr : state.lang === "hi" ? c.nameHi : c.name)}</div>
          <div class="cm-crop-list-season">${esc(c.season)}</div>
        </div>
        <div class="cm-crop-list-price">${esc(c.mandiPrice)}</div>
        <div style="color:#ccc;margin-left:4px">›</div>
      </div>`,
      )
      .join("")}`;
}

function buildOpportunityScreen() {
  const opps =
    typeof OPPORTUNITY_CROPS !== "undefined" ? OPPORTUNITY_CROPS : [];
  return `
    <div class="cm-section-header">
      <div class="cm-section-title">🌍 ${t("opportunityTitle")}</div>
      <div class="cm-section-sub">${t("opportunitySub")}</div>
    </div>
    ${opps
      .map(
        (c) => `
      <div class="cm-opp-card">
        <div class="cm-opp-header">
          <div class="cm-opp-icon">${c.icon}</div>
          <div>
            <div class="cm-opp-title">${esc(c.name)}</div>
            <div class="cm-opp-region">${esc(c.region)}</div>
            <div style="margin-top:6px"><span class="cm-tag" style="font-size:0.65rem">🗓️ ${esc(c.season)}</span></div>
          </div>
        </div>
        <div class="cm-opp-body">
          <div class="cm-opp-stats">
            <div class="cm-opp-stat"><div class="cm-opp-stat-val" style="color:#2E7D32">${esc(c.profit)}</div><div class="cm-opp-stat-label">${t("profit")}</div></div>
            <div class="cm-opp-stat"><div class="cm-opp-stat-val cm-risk-${c.risk}">${t(c.risk)}</div><div class="cm-opp-stat-label">${t("risk")}</div></div>
            <div class="cm-opp-stat"><div class="cm-opp-stat-val" style="font-size:0.72rem">${esc(c.subsidy)}</div><div class="cm-opp-stat-label">${t("subsidy")}</div></div>
          </div>
          <div class="cm-opp-story">💬 ${esc(c.story)}</div>
          <div class="cm-opp-why">🌱 ${state.lang === "mr" ? "तुमच्यासाठी का?" : "Why for you?"}: ${esc(c.whyHere)}</div>
        </div>
      </div>`,
      )
      .join("")}`;
}

function getLessonTitle(lesson) {
  if (typeof lesson.title === "object")
    return lesson.title[state.lang] || lesson.title.en || "";
  return lesson.title || "";
}
function getSectionHeading(section) {
  if (typeof section.heading === "object")
    return section.heading[state.lang] || section.heading.en || "";
  return section.heading || "";
}
function getSectionText(section) {
  if (typeof section.text === "object")
    return section.text[state.lang] || section.text.en || "";
  return section.text || "";
}

function buildLessonDetail(lesson) {
  const title = getLessonTitle(lesson);
  const backLabel =
    state.lang === "mr"
      ? "← मागे"
      : state.lang === "hi"
        ? "← वापस"
        : state.lang === "ta"
          ? "← பின்"
          : "← Back";
  const completed = state.badges.includes(lesson.id);
  const completeLabel = completed
    ? "✅ " +
      (state.lang === "mr"
        ? "पूर्ण झाले!"
        : state.lang === "hi"
          ? "पूर्ण हो गया!"
          : state.lang === "ta"
            ? "முடிந்தது!"
            : "Already Completed!")
    : "✅ " +
      (state.lang === "mr"
        ? "धडा पूर्ण करा — " + lesson.xp + " XP मिळवा"
        : state.lang === "hi"
          ? "पाठ पूरा करें — " + lesson.xp + " XP पाएं"
          : state.lang === "ta"
            ? "பாடம் முடிக்கவும் — " + lesson.xp + " XP பெறவும்"
            : "Complete Lesson — Earn " + lesson.xp + " XP");

  return `
    <div>
      <div style="background:linear-gradient(135deg,#1B5E20,#2E7D32);padding:22px 14px 18px">
        <button onclick="closeLesson()" style="background:none;border:none;color:rgba(255,255,255,0.9);font-size:0.9rem;cursor:pointer;padding:0;display:flex;align-items:center;gap:5px;margin-bottom:12px;font-family:inherit">${backLabel}</button>
        <div style="font-size:3rem;margin-bottom:8px">${lesson.icon}</div>
        <div style="font-family:Georgia,serif;font-size:1.4rem;font-weight:700;color:#fff;margin-bottom:4px">${esc(title)}</div>
        <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:8px">
          <span style="background:rgba(255,255,255,0.2);border-radius:12px;padding:3px 10px;font-size:0.75rem;color:#fff">⏱ ${esc(lesson.duration)}</span>
          <span style="background:rgba(255,255,255,0.2);border-radius:12px;padding:3px 10px;font-size:0.75rem;color:#fff">📊 ${esc(lesson.level)}</span>
          <span style="background:#FF8F00;border-radius:12px;padding:3px 10px;font-size:0.75rem;color:#fff;font-weight:700">+${lesson.xp} XP</span>
        </div>
      </div>
      <div style="padding:16px">
        ${(lesson.content || [])
          .map(
            (section, i) => `
          <div style="background:#fff;border-radius:14px;padding:16px;margin-bottom:12px;box-shadow:0 2px 8px rgba(0,0,0,0.06)">
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">
              <div style="width:28px;height:28px;background:#4CAF50;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:0.78rem;font-weight:800;color:#fff;flex-shrink:0">${i + 1}</div>
              <div style="font-size:0.95rem;font-weight:700;color:#1A3C20">${esc(getSectionHeading(section))}</div>
            </div>
            <div style="font-size:0.88rem;color:#333;line-height:1.7;padding-left:38px">${esc(getSectionText(section))}</div>
          </div>`,
          )
          .join("")}
        <button onclick="earnBadge(${lesson.id}); closeLesson();" style="width:100%;background:${completed ? "#6B8F72" : "#2E7D32"};border:none;border-radius:13px;padding:14px;color:#fff;font-family:inherit;font-size:0.96rem;font-weight:700;cursor:pointer;margin-top:4px">
          ${completeLabel}
        </button>
      </div>
    </div>`;
}

function buildLearnScreen() {
  if (state.selectedLesson) return buildLessonDetail(state.selectedLesson);
  const lessons = typeof LESSONS !== "undefined" ? LESSONS : [];
  const schemes = typeof SCHEMES !== "undefined" ? SCHEMES : [];
  return `
    <div class="cm-section-header">
      <div class="cm-section-title">📚 ${t("learnTitle")}</div>
    </div>
    <div class="cm-tab-row">
      <button class="cm-tab-btn ${state.learnTab === "schemes" ? "active" : ""}" onclick="setState({learnTab:'schemes'})">🏛️ ${t("schemes")}</button>
      <button class="cm-tab-btn ${state.learnTab === "lessons" ? "active" : ""}" onclick="setState({learnTab:'lessons'})">📖 ${t("lessons")}</button>
    </div>
    ${
      state.learnTab === "schemes"
        ? schemes
            .map(
              (s) => `
      <div class="cm-scheme-card">
        <div class="cm-scheme-top">
          <div class="cm-scheme-icon">${s.icon}</div>
          <div><div class="cm-scheme-name">${esc(s.name)}</div><div class="cm-scheme-benefit">✅ ${esc(s.benefit)}</div></div>
        </div>
        <div class="cm-scheme-desc">${esc(s.description)}</div>
        <div style="font-size:0.72rem;color:#9E9E9E;margin-top:6px">⏰ ${esc(s.deadline)}</div>
        <a href="${s.applyLink}" target="_blank" rel="noopener noreferrer" style="text-decoration:none">
          <button class="cm-scheme-btn">🔗 ${t("applyNow")}</button>
        </a>
      </div>`,
            )
            .join("")
        : `
      <div class="cm-badges-row">
        ${[
          ["🌱", "Beginner"],
          ["💧", "Water Saver"],
          ["🧪", "Soil Expert"],
          ["🌿", "Organic"],
        ]
          .map(([e, n]) => `<div class="cm-badge">${e} ${n}</div>`)
          .join("")}
      </div>
      ${lessons
        .map(
          (l) => `
        <div class="cm-lesson-card" onclick="openLesson(${l.id})" style="cursor:pointer">
          <div class="cm-lesson-icon">${l.icon}</div>
          <div style="flex:1">
            <div class="cm-lesson-name">${esc(typeof l.title === "object" ? l.title[state.lang] || l.title.en : l.title)}</div>
            <div class="cm-lesson-meta">
              <span>${esc(l.duration)}</span><span>•</span><span>${esc(l.level)}</span>
              <span class="cm-xp-badge">+${l.xp} XP</span>
            </div>
          </div>
          <div style="display:flex;align-items:center;gap:6px">
            ${state.badges.includes(l.id) ? '<span style="font-size:1.1rem">✅</span>' : ""}
            <span style="color:#4CAF50;font-weight:700">›</span>
          </div>
        </div>`,
        )
        .join("")}`
    }`;
}

function buildCommunityScreen() {
  const tips = typeof COMMUNITY_TIPS !== "undefined" ? COMMUNITY_TIPS : [];
  return `
    <div class="cm-section-header">
      <div class="cm-section-title">👨‍🌾 ${t("communityTitle")}</div>
    </div>
    <div class="cm-section">
      <div class="cm-chat-box">
        <div class="cm-card-title-dark">🤖 ${t("askAI")}</div>
        <div class="cm-chat-messages" id="chat-msgs">
          ${state.chatMessages.map((m) => `<div class="cm-chat-msg ${m.role}">${esc(m.text)}</div>`).join("")}
          ${state.chatLoading ? '<div class="cm-loading" style="padding:8px 0"><div class="cm-dot"></div><div class="cm-dot"></div><div class="cm-dot"></div></div>' : ""}
        </div>
        <div class="cm-chat-input-row">
          <input class="cm-chat-input" id="chat-input" value="${esc(state.chatInput)}" placeholder="${t("typeQuestion")}">
          <button class="cm-chat-send" onclick="sendChat()">➤</button>
        </div>
      </div>
      <div class="cm-card-title-dark" style="padding:8px 0 10px">${t("tips")}</div>
      ${tips
        .map(
          (tip) => `
        <div class="cm-tip-card">
          <div class="cm-tip-header">
            <div class="cm-tip-avatar">${tip.avatar}</div>
            <div>
              <div class="cm-tip-name">${esc(tip.farmer)} ${tip.verified ? '<span class="cm-verified-badge">✓</span>' : ""}</div>
              <div class="cm-tip-meta">${esc(tip.village)} • ${esc(tip.crop)} • ${esc(tip.time)}</div>
            </div>
          </div>
          <div class="cm-tip-text">${esc(tip.tip)}</div>
          <div class="cm-tip-footer">
            <div class="cm-tip-likes">👍 ${tip.likes}</div>
            <a href="https://wa.me/?text=${encodeURIComponent(tip.tip)}" target="_blank" style="text-decoration:none">
              <button class="cm-whatsapp-btn">📲 WhatsApp</button>
            </a>
          </div>
        </div>`,
        )
        .join("")}
    </div>`;
}

function buildSettingsScreen() {
  const p = state.profile;
  return `
    <div class="cm-section" style="padding-top:16px">
      <div style="background:linear-gradient(135deg,#1B5E20,#2E7D32);border-radius:18px;padding:20px;margin-bottom:14px;display:flex;align-items:center;gap:14px">
        <div style="width:58px;height:58px;background:rgba(255,255,255,0.2);border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:1.9rem;flex-shrink:0">👨‍🌾</div>
        <div>
          <div style="font-family:Georgia,serif;font-size:1.2rem;font-weight:700;color:#fff;margin-bottom:3px">${esc(p.name || (state.lang === "mr" ? "शेतकरी मित्र" : state.lang === "hi" ? "किसान मित्र" : "Farmer"))}</div>
          <div style="font-size:0.78rem;color:rgba(255,255,255,0.85);margin-bottom:2px">📍 ${esc(p.village || (state.lang === "mr" ? "गाव टाका" : "Enter village"))}</div>
          <div style="font-size:0.75rem;color:rgba(255,255,255,0.75)">🌾 ${esc(cropName(p.crop))} &nbsp;•&nbsp; 🪨 ${p.soil === "black" ? (state.lang === "mr" ? "काळी माती" : "Black Soil") : p.soil === "red" ? (state.lang === "mr" ? "लाल माती" : "Red Soil") : p.soil === "sandy" ? (state.lang === "mr" ? "वालुकामय" : "Sandy") : state.lang === "mr" ? "चिकणमाती" : "Loamy"}</div>
        </div>
      </div>

      <div class="cm-card">
        <div class="cm-card-title-dark">✏️ ${state.lang === "mr" ? "प्रोफाइल संपादित करा" : state.lang === "hi" ? "प्रोफाइल संपादित करें" : "Edit Profile"}</div>
        <div class="cm-form-group">
          <label class="cm-label">${state.lang === "mr" ? "तुमचे नाव" : state.lang === "hi" ? "आपका नाम" : "Your Name"}</label>
          <input class="cm-input" id="set-name" value="${esc(p.name)}" placeholder="${state.lang === "mr" ? "राजेश पाटील" : "Rajesh Patil"}">
        </div>
        <div class="cm-form-group">
          <label class="cm-label">${state.lang === "mr" ? "गाव/शहर" : state.lang === "hi" ? "गांव/शहर" : "Village/City"}</label>
          <input class="cm-input" id="set-village" value="${esc(p.village)}" placeholder="Nashik, Maharashtra">
        </div>
        <div class="cm-profile-grid">
          <div class="cm-form-group">
            <label class="cm-label">${state.lang === "mr" ? "पीक" : state.lang === "hi" ? "फसल" : "Crop"}</label>
            <select class="cm-input cm-select" id="set-crop">
              ${CROPS.map((c) => `<option value="${c.id}" ${p.crop === c.id ? "selected" : ""}>${c.icon} ${esc(state.lang === "mr" ? c.nameMr : state.lang === "hi" ? c.nameHi : c.name)}</option>`).join("")}
            </select>
          </div>
          <div class="cm-form-group">
            <label class="cm-label">${state.lang === "mr" ? "माती" : state.lang === "hi" ? "मिट्टी" : "Soil"}</label>
            <select class="cm-input cm-select" id="set-soil">
              <option value="black" ${p.soil === "black" ? "selected" : ""}>⚫ ${state.lang === "mr" ? "काळी" : state.lang === "hi" ? "काली" : "Black"}</option>
              <option value="red" ${p.soil === "red" ? "selected" : ""}>🔴 ${state.lang === "mr" ? "लाल" : state.lang === "hi" ? "लाल" : "Red"}</option>
              <option value="sandy" ${p.soil === "sandy" ? "selected" : ""}>🟡 ${state.lang === "mr" ? "वालुकामय" : state.lang === "hi" ? "रेतीली" : "Sandy"}</option>
              <option value="loamy" ${p.soil === "loamy" ? "selected" : ""}>🟤 ${state.lang === "mr" ? "चिकणमाती" : state.lang === "hi" ? "दोमट" : "Loamy"}</option>
            </select>
          </div>
        </div>
        <button class="cm-btn" onclick="saveProfileFromSettings()">💾 ${t("saveProfile")}</button>
        ${state.profileSaved ? `<div class="cm-success-toast">✅ ${t("profileSaved")}</div>` : ""}
      </div>

      <div class="cm-card">
        <div class="cm-card-title-dark">🌐 ${t("language")}</div>
        <div class="cm-soil-row">
          ${[
            ["mr", "मराठी 🇮🇳"],
            ["hi", "हिंदी 🇮🇳"],
            ["ta", "தமிழ் 🇮🇳"],
            ["en", "English 🌐"],
          ]
            .map(
              ([code, name]) =>
                `<div class="cm-soil-btn ${state.lang === code ? "selected" : ""}" onclick="changeLang('${code}')">${name}</div>`,
            )
            .join("")}
        </div>
      </div>

      <div class="cm-card">
        <div class="cm-card-title-dark">🤖 Gemini AI ${t("apiKeyLabel") || "API Key"}</div>
        <div class="cm-api-info">
          🔑 ${state.lang === "mr" ? "Gemini API Key मोफत मिळवा:" : "Get free Gemini API Key:"}<br>
          <a href="https://aistudio.google.com" target="_blank" class="cm-api-link">aistudio.google.com</a>
          → Sign in with Google → Get API Key<br>
          ${state.lang === "mr" ? "हे पूर्णपणे मोफत आहे!" : "Completely free!"}
        </div>
        <input class="cm-input" type="text" id="api-key-input" value="${esc(state.apiKey)}" placeholder="AIzaSy..." style="margin-bottom:8px">
        <button class="cm-btn" onclick="saveApiKey()">🔑 ${t("saveKey")}</button>
        <button class="cm-btn" id="test-api-btn" onclick="testApi()" style="background:#1565C0;margin-top:8px">🧪 ${state.lang === "mr" ? "API Key तपासा" : state.lang === "hi" ? "API Key जांचें" : "Test API Key"}</button>
        ${state.apiSaved ? `<div class="cm-success-toast">✅ ${t("apiKeySaved")}</div>` : ""}
      </div>

      ${
        state.offline
          ? `
        <div class="cm-card" style="background:#FFF8E1;border:1px solid #FFE082">
          <div style="font-weight:700;color:#E65100">📡 ${t("offlineMode")}</div>
          <div style="font-size:0.82rem;color:#5D4037;margin-top:6px">${t("cachedData")}</div>
        </div>`
          : ""
      }
    </div>`;
}

// ── MAIN APP BUILDER ─────
function buildApp() {
  const tabs = [
    ["home", "🏠", t("home")],
    ["doctor", "🔬", t("cropDoctor")],
    ["store", "🛒", t("store")],
    ["encyclopedia", "📖", t("encyclopedia")],
    ["opportunity", "🌍", t("opportunity")],
    ["learn", "📚", t("learn")],
    ["community", "👨‍🌾", t("community")],
  ];

  let screen = "";
  if (state.showSettings) screen = buildSettingsScreen();
  else {
    switch (state.tab) {
      case "home":
        screen = buildHomeScreen();
        break;
      case "doctor":
        screen = buildDoctorScreen();
        break;
      case "store":
        screen = buildStoreScreen();
        break;
      case "encyclopedia":
        screen = buildEncyclopediaScreen();
        break;
      case "opportunity":
        screen = buildOpportunityScreen();
        break;
      case "learn":
        screen = buildLearnScreen();
        break;
      case "community":
        screen = buildCommunityScreen();
        break;
    }
  }

  const profBtn = `<button class="cm-settings-btn" onclick="toggleSettings()" style="background:#E8F5E9;border:none;border-radius:20px;padding:5px 11px;font-size:0.78rem;font-weight:600;color:#2E7D32;cursor:pointer;display:flex;align-items:center;gap:4px">
    👤 ${esc(state.profile.name ? state.profile.name.split(" ")[0] : state.lang === "mr" ? "प्रोफाइल" : state.lang === "hi" ? "प्रोफाइल" : "Profile")} ${state.showSettings ? "▲" : "▼"}
  </button>`;

  return `
    <div class="cm">
      ${state.offline ? `<div class="cm-offline">📡 ${t("offlineMode")} — ${t("cachedData")}</div>` : ""}
      <div class="cm-topbar">
        <div class="cm-logo">Crop<span>Mind</span> 🌾</div>
        <div class="cm-topbar-right">
          <button class="cm-lang-btn" onclick="cycleLang()">${state.lang === "mr" ? "मराठी" : state.lang === "hi" ? "हिंदी" : state.lang === "ta" ? "தமிழ்" : "EN"}</button>
          ${profBtn}
        </div>
      </div>
      ${screen}
      <div class="cm-bottomnav">
        ${tabs
          .map(
            ([id, icon, label]) => `
          <button class="cm-nav-item ${state.tab === id && !state.showSettings ? "active" : ""}" onclick="goTab('${id}')">
            <span class="nav-icon">${icon}</span>
            <span class="nav-label">${esc(label)}</span>
            ${state.tab === id && !state.showSettings ? '<div class="cm-nav-dot"></div>' : ""}
          </button>`,
          )
          .join("")}
      </div>
    </div>`;
}

// ── EVENT HANDLERS ──────
function bindEvents() {
  // Location search input
  const locInp = document.getElementById("loc-search");
  if (locInp) {
    locInp.oninput = (e) => {
      state.locationQuery = e.target.value;
    };
    locInp.onkeydown = (e) => {
      if (e.key === "Enter") {
        state.locationQuery = e.target.value;
        searchLocation();
      }
    };
    // Auto focus
    setTimeout(() => locInp.focus(), 50);
  }

  // Symptoms textarea
  const sym = document.getElementById("symptoms-input");
  if (sym)
    sym.oninput = (e) => {
      state.symptoms = e.target.value;
    };

  // Crop search
  const cs = document.getElementById("crop-search");
  if (cs) cs.oninput = (e) => setState({ cropSearch: e.target.value });

  // Chat input
  const ci = document.getElementById("chat-input");
  if (ci) {
    ci.oninput = (e) => {
      state.chatInput = e.target.value;
    };
    ci.onkeydown = (e) => {
      if (e.key === "Enter") sendChat();
    };
    // Scroll chat to bottom
    const msgs = document.getElementById("chat-msgs");
    if (msgs) msgs.scrollTop = msgs.scrollHeight;
  }

  // API key input
  const ak = document.getElementById("api-key-input");
  if (ak)
    ak.oninput = (e) => {
      state.apiKey = e.target.value;
    };
}

// ── GLOBAL ACTION FUNCTIONS ──────
window.goTab = (id) =>
  setState({
    tab: id,
    showSettings: false,
    selectedCropDetail: null,
    selectedLesson: null,
  });
window.toggleLocationSearch = () =>
  setState({
    showLocationSearch: !state.showLocationSearch,
    locationQuery: "",
  });
window.doLocationSearch = () => {
  const inp = document.getElementById("loc-search");
  if (inp) state.locationQuery = inp.value;
  searchLocation();
};
window.toggleSettings = () => setState({ showSettings: !state.showSettings });
window.cycleLang = () => {
  const langs = ["mr", "hi", "ta", "en"];
  const next = langs[(langs.indexOf(state.lang) + 1) % langs.length];
  localStorage.setItem("cm_lang", next);
  setState({ lang: next });
};
window.changeLang = (code) => {
  localStorage.setItem("cm_lang", code);
  setState({ lang: code });
};

window.saveProfile = () => {
  const name = document.getElementById("inp-name")?.value || state.profile.name;
  const village =
    document.getElementById("inp-village")?.value || state.profile.village;
  const crop = document.getElementById("sel-crop")?.value || state.profile.crop;
  const soil = document.getElementById("sel-soil")?.value || state.profile.soil;
  const p = { name, village, crop, soil };
  localStorage.setItem("cm_profile", JSON.stringify(p));
  state.profile = p;
  setState({ profileSaved: true });
  setTimeout(() => setState({ profileSaved: false }), 2500);
};

window.saveProfileFromSettings = () => {
  const name = document.getElementById("set-name")?.value || state.profile.name;
  const village =
    document.getElementById("set-village")?.value || state.profile.village;
  const crop = document.getElementById("set-crop")?.value || state.profile.crop;
  const soil = document.getElementById("set-soil")?.value || state.profile.soil;
  const p = { name, village, crop, soil };
  localStorage.setItem("cm_profile", JSON.stringify(p));
  state.profile = p;
  setState({ profileSaved: true });
  setTimeout(() => setState({ profileSaved: false }), 2500);
};

window.testApi = async () => {
  const key = document.getElementById("api-key-input")?.value || state.apiKey;
  if (!key) {
    alert("Please enter an API key first!");
    return;
  }

  const btn = document.getElementById("test-api-btn");
  if (btn) {
    btn.textContent = "Testing...";
    btn.disabled = true;
  }

  try {
    const modelRes = await fetch("/api/models?key=" + encodeURIComponent(key));
    const modelData = await modelRes.json();

    if (modelData.error) {
      alert("API Key Error: " + modelData.error.message);
      if (btn) {
        btn.textContent = "Test API Key";
        btn.disabled = false;
      }
      return;
    }

    const available = (modelData.models || [])
      .filter(function (m) {
        return (
          m.supportedGenerationMethods &&
          m.supportedGenerationMethods.includes("generateContent")
        );
      })
      .map(function (m) {
        return m.name.replace("models/", "");
      })
      .slice(0, 5);

    const testRes = await fetch("/api/diagnose", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        apiKey: key,
        prompt: "Reply with just the word: Working",
        imageBase64: null,
      }),
    });
    const testData = await testRes.json();
    const reply =
      testData.candidates &&
      testData.candidates[0] &&
      testData.candidates[0].content &&
      testData.candidates[0].content.parts &&
      testData.candidates[0].content.parts[0]
        ? testData.candidates[0].content.parts[0].text
        : "";

    if (reply) {
      alert("API WORKING! Models: " + available.join(", "));
      localStorage.setItem("cm_apikey", key);
      state.apiKey = key;
    } else {
      var err = testData.geminiError || testData.error || "No response";
      alert("Error: " + err);
    }
  } catch (e) {
    alert(
      "Connection failed: " + e.message + ". Make sure server.js is running!",
    );
  }

  if (btn) {
    btn.textContent = "Test API Key";
    btn.disabled = false;
  }
};

window.saveApiKey = () => {
  const key = document.getElementById("api-key-input")?.value || state.apiKey;
  localStorage.setItem("cm_apikey", key);
  setState({ apiKey: key, apiSaved: true });
  setTimeout(() => setState({ apiSaved: false }), 2500);
};

window.selectDiagCrop = (id) => setState({ selectedCrop: id });
window.selectDiagSoil = (s) => setState({ selectedSoil: s });

window.onPhotoChange = (input) => {
  if (input.files && input.files[0]) handlePhoto(input.files[0]);
};
window.clearPhoto = () => setState({ photo: null, photoBase64: null });

window.setStoreFilter = (f) => setState({ storeFilter: f });
window.gotoStore = () =>
  setState({ tab: "store", storeFilter: "recommended", showSettings: false });

window.showCropDetail = (id) => {
  const c = CROPS.find((x) => x.id === id);
  setState({ selectedCropDetail: c });
};
window.gotoDoctorWithCrop = (id) =>
  setState({
    tab: "doctor",
    selectedCrop: id,
    showSettings: false,
    selectedCropDetail: null,
  });

window.openLesson = (id) => {
  const lesson = (typeof LESSONS !== "undefined" ? LESSONS : []).find(
    (l) => l.id === id,
  );
  setState({ selectedLesson: lesson });
};
window.closeLesson = () => {
  state.selectedLesson = null;
  render();
};
window.searchLocation = searchLocation;

window.earnBadge = (id) => {
  if (!state.badges.includes(id)) {
    const nb = [...state.badges, id];
    localStorage.setItem("cm_badges", JSON.stringify(nb));
    setState({ badges: nb });
  }
};

window.startVoice = startVoice;
window.runDiagnosis = runDiagnosis;
window.sendChat = sendChat;
window.setState = setState;

// ── INIT ──────────────────────────────────────────────
window.addEventListener("online", () => setState({ offline: false }));
window.addEventListener("offline", () => setState({ offline: true }));

// Initial render
render();

// Load weather after render
initWeather();
