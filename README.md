# 🎬 MediaGrab — Local Downloader Experiment

A private, local media downloader for learning how video downloading works.
Runs entirely on your machine — nothing is hosted online.

---

## ✅ Requirements

Install these before running:

1. **Node.js** — https://nodejs.org (v16 or newer)
2. **Python** — https://python.org (v3.8 or newer)
3. **yt-dlp** — the engine that extracts video links
4. **FFmpeg** — merges video + audio for HD downloads

---

## 📦 Step 1 — Install yt-dlp and FFmpeg

### Windows:
```
pip install yt-dlp
winget install ffmpeg
```

### macOS:
```
pip install yt-dlp
brew install ffmpeg
```

### Linux:
```
pip install yt-dlp
sudo apt install ffmpeg
```

---

## 🚀 Step 2 — Run the Server

Open a terminal inside this folder and run:

```
npm install
npm start
```

You should see:
```
🎬 Media Downloader running at http://localhost:3000
📁 Downloads saved to: /path/to/downloads
```

---

## 🌐 Step 3 — Open in Browser

Go to: **http://localhost:3000**

Paste any video URL → Click Fetch → Choose format → Download!

---

## 📁 Where are my files?

All downloads go into the `downloads/` folder inside this project.
You can also click the **Save** button in the UI to save them anywhere.

---

## 🎓 What you're learning

| Concept | Where it happens |
|---|---|
| HTTP servers | `server.js` — Express handles requests |
| Web scraping | `yt-dlp` extracts hidden stream URLs |
| Video processing | `FFmpeg` merges video + audio tracks |
| File serving | Express serves the downloads folder |
| Frontend + backend | The UI talks to the server via fetch() |

---

## ⚠️ Note

This is for private, educational use only.
Only download content you have the right to download.
