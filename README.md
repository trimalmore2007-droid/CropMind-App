# 🌾 CropMind — HTML/CSS/JS Version

## Quick Start (No npm install needed!)

```
node server.js
```

Open → **http://localhost:3000**

That's it! ✅

---

## Requirements

- Node.js (any version v10+)
- Internet connection (for weather + AI)

---

## Project Structure

```
cropmind/
├── server.js          ← Backend (Node.js, no dependencies)
├── package.json
└── public/
    ├── index.html     ← Main HTML
    ├── style.css      ← All styles
    ├── data.js        ← Crops, products, schemes data
    └── app.js         ← Complete app logic
```

## API Endpoints (Backend)

| Endpoint                 | Method | Description                  |
| ------------------------ | ------ | ---------------------------- |
| `/api/weather?lat=&lon=` | GET    | Live weather data            |
| `/api/city?lat=&lon=`    | GET    | City name from coordinates   |
| `/api/location`          | GET    | IP-based location            |
| `/api/diagnose`          | POST   | Gemini AI crop diagnosis     |
| `/api/chat`              | POST   | AI farming chat              |
| `/api/models?key=`       | GET    | List available Gemini models |

## Features

- 🏠 Home — Weather + Farmer Profile
- 🔬 Crop Doctor — AI Diagnosis with photo
- 🛒 Farmer Store — Products with buy links
- 📖 Encyclopedia — 12 crops full info
- 🌍 Discover — Hidden gem crops
- 📚 Learn — Govt schemes
- 👨‍🌾 Community — AI chat + farmer tips
- 👤 Profile — Inside settings

## Get Free Gemini API Key

1. Go to → https://aistudio.google.com
2. Sign in with Google
3. Click "Get API Key"
4. Paste in app ⚙️ Settings
