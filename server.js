const express = require('express');
const { execSync, spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const http = require('http');
const { WebSocketServer } = require('ws');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const PORT = process.env.PORT || 3000;
const DOWNLOAD_DIR = path.join(__dirname, 'downloads');
if (!fs.existsSync(DOWNLOAD_DIR)) fs.mkdirSync(DOWNLOAD_DIR);

app.use(express.json());
app.use(express.static('public'));
app.use('/downloads', express.static(DOWNLOAD_DIR));

// WebSocket
const jobs = new Map();
wss.on('connection', (ws) => {
  ws.on('message', (msg) => {
    try { const { jobId } = JSON.parse(msg); jobs.set(jobId, ws); } catch {}
  });
  ws.on('close', () => { for (const [k, v] of jobs) if (v === ws) jobs.delete(k); });
});
function send(jobId, data) {
  const ws = jobs.get(jobId);
  if (ws && ws.readyState === 1) ws.send(JSON.stringify(data));
}

// yt-dlp path
function getYtDlp() {
  const paths = [
    'yt-dlp',
    'D:\\Python\\Scripts\\yt-dlp.exe',
    'D:\\Python\\Scripts\\yt-dlp',
    'C:\\Python312\\Scripts\\yt-dlp.exe',
  ];
  for (const p of paths) {
    try { execSync(`"${p}" --version`, { stdio: 'ignore' }); return p; } catch {}
  }
  return null;
}

// ffmpeg path
function getFfmpeg() {
  const paths = [
    'ffmpeg',
    'C:\\Users\\DELL\\AppData\\Local\\Microsoft\\WinGet\\Links\\ffmpeg.exe',
    'C:\\ffmpeg\\bin\\ffmpeg.exe',
    'D:\\ffmpeg\\bin\\ffmpeg.exe',
  ];
  for (const p of paths) {
    try { execSync(`"${p}" -version`, { stdio: 'ignore' }); return p; } catch {}
  }
  return null;
}

function sanitizeFilename(name) {
  return name
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '')
    .replace(/[^\x20-\x7E]/g, '')
    .replace(/\s+/g, '_')
    .trim()
    .slice(0, 80) || String(Date.now());
}

// Bypass flags as proper array (for spawn)
function getBypassArgs() {
  const args = [
    '--extractor-args', 'youtube:player_client=web,default',
    '--no-check-certificates',
    '--user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    '--add-header', 'Accept-Language:en-US,en;q=0.9',
    '--socket-timeout', '30',
    '--retries', '5',
  ];
  const cookiesPath = path.join(__dirname, 'cookies.txt');
  if (fs.existsSync(cookiesPath)) {
    args.push('--cookies', cookiesPath);
    console.log('🍪 Using cookies:', cookiesPath);
  }
  return args;
}

// Spawn and collect stdout
function spawnCollect(cmd, args, timeout = 60000) {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args);
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', d => { stdout += d.toString(); });
    proc.stderr.on('data', d => { stderr += d.toString(); });
    const timer = setTimeout(() => { proc.kill(); reject(new Error('Timeout')); }, timeout);
    proc.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(stdout);
      else reject(new Error(stderr || `Exit code ${code}`));
    });
  });
}

// Info endpoint
app.post('/api/info', async (req, res) => {
  const { url } = req.body;
  if (!url || !url.startsWith('http')) return res.status(400).json({ error: 'Invalid URL.' });

  const ytdlp = getYtDlp();
  if (!ytdlp) return res.status(500).json({ error: 'yt-dlp not found.' });

  const args = [
    ...getBypassArgs(),
    '--dump-json',
    '--no-playlist',
    url
  ];

  console.log('INFO CMD:', ytdlp, args.join(' '));

  try {
    const stdout = await spawnCollect(ytdlp, args, 60000);
    const info = JSON.parse(stdout);
    const ffmpeg = getFfmpeg();

    const heights = new Set();
    (info.formats || []).forEach(f => { if (f.height) heights.add(f.height); });

    const allQ = [2160, 1440, 1080, 720, 480, 360, 240, 144];
    const available = allQ.filter(h => [...heights].some(fh => fh >= h));

    const formats = [];
    available.forEach(h => {
      let label, badge = null;
      if (h === 2160) { label = '4K Ultra HD'; badge = '4K'; }
      else if (h === 1440) { label = '1440p QHD'; badge = 'QHD'; }
      else if (h === 1080) { label = '1080p Full HD'; badge = 'FHD'; }
      else if (h === 720) { label = '720p HD'; badge = 'HD'; }
      else if (h === 480) { label = '480p SD'; }
      else if (h === 360) { label = '360p'; }
      else if (h === 240) { label = '240p'; }
      else if (h === 144) { label = '144p'; badge = 'FAST'; }

      formats.push({
        id: ffmpeg ? `bestvideo[height<=${h}]+bestaudio/best[height<=${h}]` : `best[height<=${h}]`,
        label, badge,
        desc: `MP4 · ${h}p`,
        icon: h >= 1440 ? '🎬' : h >= 720 ? '📺' : '📱',
        ext: 'mp4', height: h,
        needsFfmpeg: h >= 720 && !ffmpeg
      });
    });

    formats.push({
      id: 'bestaudio/best', label: 'Audio Only',
      desc: 'MP3 · music & podcasts', icon: '🎵',
      ext: 'mp3', badge: null, height: 0, needsFfmpeg: false
    });

    const fmt = n => n >= 1e9 ? (n/1e9).toFixed(1)+'B' : n >= 1e6 ? (n/1e6).toFixed(1)+'M' : n >= 1e3 ? (n/1e3).toFixed(1)+'K' : String(n||0);

    res.json({
      title: info.title,
      thumbnail: info.thumbnail,
      duration: info.duration_string || `${Math.floor((info.duration||0)/60)}:${String((info.duration||0)%60).padStart(2,'0')}`,
      uploader: info.uploader,
      platform: info.extractor_key,
      viewCount: info.view_count ? fmt(info.view_count) : null,
      likeCount: info.like_count ? fmt(info.like_count) : null,
      uploadDate: info.upload_date ? info.upload_date.replace(/(\d{4})(\d{2})(\d{2})/, '$3/$2/$1') : null,
      hasFfmpeg: !!ffmpeg,
      formats
    });
  } catch (e) {
    console.error('Info error:', e.message);
    res.status(500).json({ error: 'Could not fetch video info. Check the URL.' });
  }
});

// Download with real WebSocket progress
app.post('/api/download', (req, res) => {
  const { url, formatId, ext, jobId, title } = req.body;
  if (!url) return res.status(400).json({ error: 'Invalid URL.' });

  const ytdlp = getYtDlp();
  if (!ytdlp) return res.status(500).json({ error: 'yt-dlp not found.' });

  const ffmpeg = getFfmpeg();
  const safeName = title ? sanitizeFilename(title) : String(Date.now());
  const outputTemplate = path.join(DOWNLOAD_DIR, `${safeName}.%(ext)s`);

  let args = [...getBypassArgs()];

  if (ext === 'mp3') {
    args.push('-x', '--audio-format', 'mp3', '--no-playlist', '--newline', '-o', outputTemplate);
    if (ffmpeg) args.push('--ffmpeg-location', ffmpeg);
  } else if (ffmpeg) {
    args.push('-f', formatId, '--merge-output-format', 'mp4', '--ffmpeg-location', ffmpeg, '--no-playlist', '--newline', '-o', outputTemplate);
  } else {
    args.push('-f', formatId, '--no-playlist', '--newline', '-o', outputTemplate);
  }
  args.push(url);

  console.log('DOWNLOAD CMD:', ytdlp, args.join(' '));

  const proc = spawn(ytdlp, args);

  proc.stdout.on('data', (data) => {
    const line = data.toString();
    process.stdout.write(line);
    const m = line.match(/\[download\]\s+([\d.]+)%.*?at\s+([\d.]+\S+\/s)/);
    if (m) send(jobId, { type: 'progress', percent: parseFloat(m[1]), speed: m[2], msg: `Downloading... ${m[2]}` });
    if (line.includes('Merging')) send(jobId, { type: 'progress', percent: 95, speed: '', msg: 'Merging video & audio...' });
    if (line.includes('Deleting')) send(jobId, { type: 'progress', percent: 98, speed: '', msg: 'Finalizing...' });
  });

  proc.stderr.on('data', d => process.stderr.write(d.toString()));

  proc.on('close', (code) => {
    if (code !== 0) {
      send(jobId, { type: 'error' });
      return res.status(500).json({ error: 'Download failed.' });
    }

    let files = [];
    try {
      files = fs.readdirSync(DOWNLOAD_DIR)
        .filter(f => f.startsWith(safeName))
        .map(f => ({ name: f, time: fs.statSync(path.join(DOWNLOAD_DIR, f)).mtime }))
        .sort((a, b) => b.time - a.time);
    } catch(e) {}

    if (!files.length) return res.status(500).json({ error: 'File not found after download.' });

    const stat = fs.statSync(path.join(DOWNLOAD_DIR, files[0].name));
    send(jobId, { type: 'done' });
    res.json({
      success: true,
      filename: files[0].name,
      downloadUrl: `/downloads/${encodeURIComponent(files[0].name)}`,
      sizeMB: (stat.size / (1024*1024)).toFixed(2)
    });
  });
});

// List files
app.get('/api/files', (req, res) => {
  const files = fs.readdirSync(DOWNLOAD_DIR)
    .filter(f => !f.startsWith('.'))
    .map(f => {
      const stat = fs.statSync(path.join(DOWNLOAD_DIR, f));
      return { name: f, size: (stat.size/(1024*1024)).toFixed(2)+' MB', date: stat.mtime.toLocaleString(), url: `/downloads/${encodeURIComponent(f)}` };
    })
    .sort((a, b) => new Date(b.date) - new Date(a.date));
  res.json(files);
});

// Delete file
app.delete('/api/files/:name', (req, res) => {
  const fp = path.join(DOWNLOAD_DIR, req.params.name);
  if (fs.existsSync(fp)) { fs.unlinkSync(fp); res.json({ success: true }); }
  else res.status(404).json({ error: 'Not found.' });
});

server.listen(PORT, () => {
  console.log(`\n⚡ NoxLoad running at http://localhost:${PORT}`);
  console.log(`📁 Downloads: ${DOWNLOAD_DIR}`);
  console.log(`🔧 FFmpeg: ${getFfmpeg() || 'NOT FOUND'}`);
  console.log(`🐍 yt-dlp: ${getYtDlp() || 'NOT FOUND'}`);
  console.log(`🍪 Cookies: ${fs.existsSync(path.join(__dirname, 'cookies.txt')) ? 'FOUND' : 'NOT FOUND'}\n`);
});
