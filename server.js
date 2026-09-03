const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

// Support Vercel serverless /tmp fallback and local/Render persistent directory
const isVercel = Boolean(process.env.VERCEL);
const DATA_DIR = isVercel ? path.join('/tmp', 'data') : path.join(__dirname, 'data');
const PACKAGES_FILE = path.join(DATA_DIR, 'packages.json');
const UPLOADS_DIR = isVercel ? path.join('/tmp', 'uploads') : path.join(__dirname, 'uploads');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
if (!fs.existsSync(PACKAGES_FILE)) fs.writeFileSync(PACKAGES_FILE, JSON.stringify({}), 'utf-8');

function loadPackages() {
  try {
    const raw = fs.readFileSync(PACKAGES_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    console.error('Error loading packages:', err);
    return {};
  }
}

function savePackages(packages) {
  try {
    fs.writeFileSync(PACKAGES_FILE, JSON.stringify(packages, null, 2), 'utf-8');
  } catch (err) {
    console.error('Error saving packages:', err);
  }
}

let packagesStore = loadPackages();

app.use(cors());
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));

// Static assets & uploads
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(UPLOADS_DIR));

// File Upload
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, UPLOADS_DIR);
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname) || '.bin';
    const randomName = crypto.randomBytes(8).toString('hex') + '-' + Date.now() + ext;
    cb(null, randomName);
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 15 * 1024 * 1024 } // 15MB
});

app.post('/api/upload', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }
  const fileUrl = '/uploads/' + req.file.filename;
  res.json({ fileUrl });
});

// Create Package (100% Free - No Payment)
app.post('/api/packages', (req, res) => {
  try {
    const { title, from, message, items, theme } = req.body;
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Add at least one item before generating a link.' });
    }

    const id = crypto.randomBytes(5).toString('hex');
    const pkg = {
      id,
      theme: theme || 'custom',
      title: (title || 'cutie').trim(),
      from: (from || 'bestie').trim(),
      message: (message || '').trim(),
      items: items,
      createdAt: new Date().toISOString(),
      views: 0,
      openedAt: null
    };

    // Reload store before writing to stay in sync with concurrent requests
    packagesStore = loadPackages();
    packagesStore[id] = pkg;
    savePackages(packagesStore);

    res.json({
      id,
      url: '/p/' + id
    });
  } catch (err) {
    console.error('Error creating package:', err);
    res.status(500).json({ error: 'Internal server error saving package' });
  }
});

// Get Package by ID
app.get('/api/packages/:id', (req, res) => {
  packagesStore = loadPackages();
  const pkg = packagesStore[req.params.id];
  if (!pkg) {
    return res.status(404).json({ error: 'Package not found' });
  }
  pkg.views = (pkg.views || 0) + 1;
  savePackages(packagesStore);
  res.json(pkg);
});

// Package Opened Webhook
app.post('/api/packages/:id/opened', (req, res) => {
  packagesStore = loadPackages();
  const pkg = packagesStore[req.params.id];
  if (pkg && !pkg.openedAt) {
    pkg.openedAt = new Date().toISOString();
    savePackages(packagesStore);
  }
  res.json({ ok: true });
});

// Recipient route: serve index.html for any /p/:id
app.get('/p/:id', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start Server locally or on persistent containers (Render, Railway, etc.)
if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`✨ A Little Box of Goodies running at: http://localhost:${PORT}`);
  });
}

// Export for Vercel Serverless
module.exports = app;
