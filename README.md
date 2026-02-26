<h1 align="center">
  🔍 Glass Finder
</h1>

<p align="center">
  <b>Tempered Glass Compatibility Checker</b><br/>
  Instantly find which tempered glass fits your phone — powered by a live GSMArena database.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/React-18-61DAFB?style=for-the-badge&logo=react&logoColor=white" />
  <img src="https://img.shields.io/badge/Vite-7-646CFF?style=for-the-badge&logo=vite&logoColor=white" />
  <img src="https://img.shields.io/badge/TailwindCSS-3-38BDF8?style=for-the-badge&logo=tailwindcss&logoColor=white" />
  <img src="https://img.shields.io/badge/Node.js-Express-339933?style=for-the-badge&logo=node.js&logoColor=white" />
  <img src="https://img.shields.io/badge/Scraper-GSMArena-1E90FF?style=for-the-badge" />
</p>

---

## ✨ Features

| Feature | Description |
|---|---|
| 🏷️ **Brand Filter** | Filter the entire local DB by brand with one click, with model counts shown |
| 🔍 **Smart Search** | Inline expanding results with phone image, brand pill, screen size & type |
| 🌐 **Online Scrape** | Fetch any phone from GSMArena live and add it to the local database |
| ✅ **3 Check Modes** | Type A (Clear), Type B (Full Cover), Type C (UV Hot-Bend) compatibility logic |
| 📋 **Copy Result** | Copy the full compatibility report to clipboard in one click |
| 🔄 **New Check** | Reset everything instantly |
| 🗓️ **Recent History** | Last 5 checks saved to `localStorage` with color-coded results, click to restore |
| 🔄 **360° View** | View the device in 360° via 91mobiles iframe (if available) |
| 🔎 **Zoom Modal** | Side-by-side full-size image comparison of glass vs device |
| ✏️ **Manual Entry** | Add or edit any phone model directly in the UI |
| 🔢 **Live DB Stats** | Phone count shown in header; per-brand counts in filter chips |
| 🔔 **Toast Alerts** | Non-blocking green/red notifications instead of `alert()` popups |

---

## 📸 App Preview

> **Glass Finder** — Dark glassmorphism UI with purple/blue accent palette

```
┌─────────────────────────────────────────────┐
│           🔍  Glass Finder                  │
│     Tempered Glass Compatibility Checker    │
│           📱 5585 models in local DB        │
│                                             │
│  Filter by Brand                            │
│  [ All 5585 ] [ Samsung 340 ] [ vivo 210 ]  │
│  [ Realme 195 ] [ Xiaomi 180 ] ...          │
│                                             │
│  ┌─ Step 1: Select Glass ────────────────┐  │
│  │  [Type A] [Type B] [Type C]           │  │
│  │  🔍 Samsung Galaxy S24...             │  │
│  │  ┌──────────────────────────────┐     │  │
│  │  │ 📱 Galaxy S24     Samsung    │     │  │
│  │  │    6.2" • Flat • Punch Hole  │     │  │
│  │  └──────────────────────────────┘     │  │
│  └───────────────────────────────────────┘  │
│                                             │
│  ┌─ Step 2: Target Device ───────────────┐  │
│  │  🔍 Galaxy A55...                     │  │
│  └───────────────────────────────────────┘  │
│                                             │
│  ████████ CHECK COMPATIBILITY ████████      │
│                                             │
│  ✅ COMPATIBLE                              │
│  ┌────────────┬────────┬────────┬───────┐  │
│  │ Spec       │ Glass  │ Device │  Diff │  │
│  ├────────────┼────────┼────────┼───────┤  │
│  │ Body H     │ 147mm  │ 161mm  │ -14mm │  │
│  │ Screen     │ 6.2"   │ 6.2"   │ 0.00" │  │
│  └────────────┴────────┴────────┴───────┘  │
│  [ 📋 Copy Result ]  [ 🔄 New Check ]       │
└─────────────────────────────────────────────┘
```

---

## 🧠 Compatibility Logic

### Type A — Clear Glass
Matches on: **Screen type**, **Notch type**, **Screen size** (±0.80"), **Display height** (±0.90mm), **Display width** (±0.90mm)

### Type B — Full Cover
Strict bezel matching: Glass must not overhang device by >0.2mm. Black borders are checked.

### Type C — UV Hot-Bend / Curved
**Exact model name match** required due to per-device curve variance.

---

## 🏗️ Tech Stack

| Layer | Tech |
|---|---|
| Frontend | React 18, Vite 7, Tailwind CSS 3 |
| Backend | Node.js, Express, Axios, Cheerio |
| Data Source | GSMArena (live scraper + local `phones.json`) |
| Storage | `phones.json` (local DB) + `localStorage` (history) |

---

## 🚀 Getting Started

### Prerequisites
- Node.js 18+
- npm

### Installation

```bash
# Clone the repo
git clone https://github.com/pethupraveen72/tempered-glass-checker.git
cd tempered-glass-checker

# Install dependencies
npm install

# Start both frontend (Vite) and backend (Express) together
npm run dev
```

The app will be available at:
- **Frontend:** `http://localhost:5173`
- **Backend API:** `http://localhost:3000`

> Access from any device on your network at `http://<your-ip>:5173`

---

## 📡 API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/search?model=<name>` | Scrape GSMArena for a phone and save to DB |
| `POST` | `/api/manual-entry` | Add / update a phone manually |
| `GET` | `/api/health` | Server health check |

---

## 📁 Project Structure

```
tempered-glass-checker/
├── src/
│   ├── App.jsx          # Main React component (UI, state, logic)
│   └── index.css        # Global styles + animations
├── public/
│   └── phones.json      # Local phone database (5500+ models)
├── server.js            # Express backend (scraper + API)
├── package.json
└── vite.config.js
```

---

## 📜 License

MIT © [Pethupraveen](https://github.com/pethupraveen72)
