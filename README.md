# 🌾 CropMind — Smart AI Agriculture & Farmer Resource Hub

[![Live Demo](https://img.shields.io/badge/Demo-Live_App-brightgreen?style=for-the-badge&logo=render)](https://cropmind-app.onrender.com)
[![Node.js](https://img.shields.io/badge/Backend-Node.js_Express-blue?style=for-the-badge&logo=nodedotjs)](https://nodejs.org/)
[![Database](https://img.shields.io/badge/Database-MongoDB-green?style=for-the-badge&logo=mongodb)](https://www.mongodb.com/)
[![AI Integration](https://img.shields.io/badge/AI-Google_Gemini_Multimodal-orange?style=for-the-badge&logo=google)](https://aistudio.google.com/)
  
## 🌐 Live Application Link

Access the live production deployment of CropMind here:  
👉 **[Launch CropMind Live App](https://cropmind-app.onrender.com)** _(Replace with your actual deployment URL)_

## 🏗️ System Architecture & Data Flow Diagram

CropMind follows a robust, decoupled architecture separating the lightweight Glassmorphism frontend from the Express backend, integrated with Google OAuth and Gemini AI.

               ┌──────────────────────────────────────────────────────────────────────────────────┐
               │                               CROPMIND FRONTEND                                  │
               │          HTML5 • Glassmorphism CSS3 • Global Window Auth Module                  │
               └───────────────────────────────────────┬──────────────────────────────────────────┘
                                                       │
                             ┌─────────────────────────┴─────────────────────────────┐
                             │                                                       │
                             ▼                                                       ▼
                 ┌───────────────────────────┐                         ┌──────────────────────────┐
                 │      REST API Calls       │                         │           Google         │
                 │      (JSON / Base64)      │                         │    Identity Services     │
                 └─────────────┬─────────────┘                         └─────────────┬────────────┘
                               │                                                     │
                               │                                                     │
                               ▼                                                     ▼
                 ┌───────────────────────────┐                         ┌──────────────────────────┐
                 │      EXPRESS SERVER       │                         │   GOOGLE OAUTH 2.0 API   │
                 │        (server.js)        │                         │   (Token Authentication) │
                 └─────────────┬─────────────┘                         └─────────────┬────────────┘
                               │                                                     │
                   ┌───────────┴───────────┐                               ┌─────────┴───────────┐
                   ▼                       ▼                               ▼                     ▼
           ┌───────────────┐       ┌───────────────┐                           ┌──────────────┐
           │  GEMINI AI    │       │   MONGODB     │◄──────────────────────────┤ TOKEN VERIFY │
           │ Vision / Text │       │ Database Sync │         User Data         │ & USER SYNC  │
           └───────────────┘       └───────────────┘                           └──────────────┘

## ⚡ Recent Technical Upgrades & Enhancements

Key architecture improvements implemented in the latest release:

### 1. Global Window Scope Authentication Architecture

- Consolidated all scattered auth logic into a single **Global Auth Module** attached directly to the `window` object (`window.renderLoginCard`, `window.handleLogout`, `window.toggleAuthCard`, etc.).
- Completely eliminated `Uncaught ReferenceError` and function shadowing issues caused by script loading order.

### 2. Sequential Express Middleware & Safe Routing

- Re-architected `server.js` using strict top-to-bottom route execution.
- Moved `/api/auth/google` and all REST API routes **above the wildcard static fallback route** (`app.use('*')`), resolving HTML response conflicts and JSON parsing errors permanently.

### 3. Server-Side JWT Verification & Fail-Safe Database Sync

- Integrated `google-auth-library` (`OAuth2Client`) for verifying Google Identity tokens on the backend.
- Implemented **Fail-Safe DB Fallback**: If MongoDB connection is interrupted, authentication seamlessly falls back to session-based UI rendering without crashing the application.

## 🔐 Security & Identity Flow Diagram

[ User Clicks Auth Button ]
│
▼
[ Google OAuth 2.0 GIS Modal ] ──► (Generates Signed JWT ID Token)
│
▼
[ Send Token to Backend ] ───────► POST /api/auth/google
│
▼
[ Google Cloud Verification ] ───► (Validates Token & Audience)
│
▼
[ MongoDB Database Sync ] ───────► (Fetch or Create Kisan Profile)
│
▼
[ Render User Profile Card ] ◄─── (Return User Profile Payload)

## ✨ Core Features Breakdown

### 👤 1. One-Tap Google Authentication & Farmer Profile

- Secure, single-click sign-in using Google OAuth 2.0.
- Persistent session storage (`localStorage`) automatically restores user profile cards upon page reload.
- Customized farmer profile tracking location (Gaon), crop type (Fasal), and soil variety (Mitti).

### 🔬 2. AI Crop Doctor (Multimodal Disease Diagnosis)

- Instant diagnosis of plant diseases via leaf photograph uploads or live camera capture.
- Leverages Gemini Multimodal Vision API to detect pathogens, pests, and nutrient deficiencies with actionable organic and chemical treatment plans.

### 💬 3. Multilingual AI Farming Assistant

- Context-aware AI chat advisor tailored for Indian agricultural practices.
- Multi-language support including **Hindi, Marathi, Tamil, and English**.
- Sub-120-word quick responses focused on practical, cost-effective farming advice.

### 🌤️ 4. Real-Time Geolocation & Weather Intelligence

- Automatic IP/GPS geocoding to retrieve precise local temperature, humidity, and weather conditions.
- Provides daily agricultural warnings and sowing/irrigation recommendations based on climate data.

### 📖 5. Agricultural Encyclopedia & Government Schemes

- Comprehensive guides for major Indian crops covering soil requirements, fertilizer ratios, and harvesting cycles.
- Curated index of official government agricultural welfare programs, subsidies, and crop insurance schemes.

## 🔌 API Endpoints Reference

| Endpoint           | Method | Payload / Params                                  | Description                                                           |
| :----------------- | :----- | :------------------------------------------------ | :-------------------------------------------------------------------- |
| `/api/auth/google` | `POST` | `{ token: "JWT_TOKEN" }`                          | Verifies Google ID token, syncs MongoDB user, returns profile.        |
| `/api/diagnose`    | `POST` | `{ prompt, imageBase64, mimeType, selectedCrop }` | Analyzes crop image via Gemini Vision API and returns treatment plan. |
| `/api/chat`        | `POST` | `{ message, lang, apiKey }`                       | Multilingual AI chat assistant response.                              |
| `/api/weather`     | `GET`  | `?lat={latitude}&lon={longitude}`                 | Live weather and agricultural forecast data.                          |
| `/api/city`        | `GET`  | `?lat={latitude}&lon={longitude}`                 | Reverse geocoding for farm location identification.                   |
| `/api/location`    | `GET`  | _None_                                            | Fallback IP-based geolocation determination.                          |

## 🔒 Environment & Configuration Security

All sensitive parameters are stored securely on the host platform environment variables:

env
PORT=3000
GEMINI_API_KEY=your_production_gemini_key
GOOGLE_CLIENT_ID=your_oauth_client_id.apps.googleusercontent.com
MONGODB_URI=your_mongodb_connection_string

⚠️ Note: Never commit secrets or .env files to public code repositories. Always use environment variables on the production server.

📄 License
This project is open-source and available under the MIT License.
