require('dotenv').config();
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASS || 'changeme';
const FILE_USER = process.env.FILE_USER || process.env.ADMIN_USER || 'admin';
const FILE_PASS = process.env.FILE_PASS || process.env.ADMIN_PASS || 'changeme';

const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir);
const uploadsDir = path.join(dataDir, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir);

const db = new sqlite3.Database(path.join(dataDir, 'messages.db'));

function dbRun(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) reject(err); else resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}
function dbGet(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => { if (err) reject(err); else resolve(row); });
  });
}
function dbAll(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => { if (err) reject(err); else resolve(rows); });
  });
}

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    subject TEXT NOT NULL,
    message TEXT NOT NULL,
    ip TEXT,
    read INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    content TEXT DEFAULT '',
    pinned INTEGER DEFAULT 0,
    color TEXT DEFAULT 'default',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
});

const sessions = new Map();
const FILE_SESSION_MS = 8 * 60 * 60 * 1000;

function createSession() {
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, { created: Date.now() });
  return token;
}
function validSession(token) {
  const s = sessions.get(token);
  if (!s) return false;
  if (Date.now() - s.created > FILE_SESSION_MS) { sessions.delete(token); return false; }
  return true;
}
setInterval(() => {
  for (const [k, v] of sessions.entries()) {
    if (Date.now() - v.created > FILE_SESSION_MS) sessions.delete(k);
  }
}, 30 * 60 * 1000);

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const safe = file.originalname.replace(/[^a-zA-Z0-9._\- ]/g, '_');
    cb(null, Date.now() + '_' + safe);
  }
});
const upload = multer({ storage, limits: { fileSize: 100 * 1024 * 1024 } });

app.use(express.json());
app.use((req, res, next) => {
  if (req.path.startsWith('/file')) return next();
  express.static(__dirname)(req, res, next);
});

app.post('/api/contact', async (req, res) => {
  try {
    const { name, email, subject, message } = req.body;
    if (!name || !email || !subject || !message)
      return res.status(400).json({ error: 'Tüm alanlar zorunlu.' });
    if (name.length > 100 || email.length > 100 || subject.length > 200 || message.length > 2000)
      return res.status(400).json({ error: 'Girdi çok uzun.' });
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    await dbRun('INSERT INTO messages (name, email, subject, message, ip) VALUES (?, ?, ?, ?, ?)',
      [name.trim(), email.trim(), subject.trim(), message.trim(), ip]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Sunucu hatası.' }); }
});

const loginAttempts = new Map();
const MAX_ATTEMPTS = 5;
const LOCK_MS = 15 * 60 * 1000;
const ATTEMPT_WINDOW_MS = 10 * 60 * 1000;

function getClientIp(req) {
  return (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
}
function isLocked(ip) {
  const e = loginAttempts.get(ip);
  if (!e) return false;
  if (e.lockedUntil && Date.now() < e.lockedUntil) return true;
  if (e.lockedUntil && Date.now() >= e.lockedUntil) { loginAttempts.delete(ip); return false; }
  return false;
}
function recordFailure(ip) {
  const now = Date.now();
  let e = loginAttempts.get(ip) || { attempts: [], lockedUntil: null };
  e.attempts = e.attempts.filter(t => now - t < ATTEMPT_WINDOW_MS);
  e.attempts.push(now);
  if (e.attempts.length >= MAX_ATTEMPTS) e.lockedUntil = now + LOCK_MS;
  loginAttempts.set(ip, e);
}
function recordSuccess(ip) { loginAttempts.delete(ip); }
function getRemainingLock(ip) {
  const e = loginAttempts.get(ip);
  if (!e || !e.lockedUntil) return 0;
  return Math.ceil((e.lockedUntil - Date.now()) / 1000 / 60);
}
setInterval(() => {
  const now = Date.now();
  for (const [ip, e] of loginAttempts.entries()) {
    if (e.lockedUntil && now > e.lockedUntil + 60000) loginAttempts.delete(ip);
    else if (!e.lockedUntil && e.attempts.every(t => now - t > ATTEMPT_WINDOW_MS)) loginAttempts.delete(ip);
  }
}, 5 * 60 * 1000);

function basicAuth(req, res, next) {
  const ip = getClientIp(req);
  if (isLocked(ip)) {
    return res.status(429).send(`Çok fazla hatalı giriş. ${getRemainingLock(ip)} dakika sonra tekrar deneyin.`);
  }
  const auth = req.headers['authorization'];
  if (!auth || !auth.startsWith('Basic ')) {
    res.set('WWW-Authenticate', 'Basic realm="Admin Panel"');
    return res.status(401).send('Yetkisiz erişim.');
  }
  const decoded = Buffer.from(auth.split(' ')[1], 'base64').toString();
  const colonIdx = decoded.indexOf(':');
  const user = decoded.substring(0, colonIdx);
  const pass = decoded.substring(colonIdx + 1);
  if (user !== ADMIN_USER || pass !== ADMIN_PASS) {
    recordFailure(ip);
    const entry = loginAttempts.get(ip);
    const remaining = MAX_ATTEMPTS - (entry ? entry.attempts.length : 0);
    res.set('WWW-Authenticate', 'Basic realm="Admin Panel"');
    if (isLocked(ip)) return res.status(429).send('Çok fazla hatalı giriş. 15 dakika kilitleme aktif.');
    return res.status(401).send(`Kullanıcı adı veya şifre hatalı. ${remaining > 0 ? remaining + ' deneme hakkı kaldı.' : ''}`);
  }
  recordSuccess(ip);
  next();
}

app.get('/admin', basicAuth, (req, res) => res.sendFile(path.join(__dirname, 'admin.html')));

app.get('/api/admin/messages', basicAuth, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 20;
    const offset = (page - 1) * limit;
    const where = req.query.unread === '1' ? 'WHERE read = 0' : '';
    const total = (await dbGet(`SELECT COUNT(*) as count FROM messages ${where}`)).count;
    const messages = await dbAll(`SELECT * FROM messages ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`, [limit, offset]);
    res.json({ messages, total, page, pages: Math.ceil(total / limit) });
  } catch (e) { res.status(500).json({ error: 'Sunucu hatası.' }); }
});

app.patch('/api/admin/messages/:id/read', basicAuth, async (req, res) => {
  await dbRun('UPDATE messages SET read = 1 WHERE id = ?', [req.params.id]);
  res.json({ success: true });
});

app.delete('/api/admin/messages/:id', basicAuth, async (req, res) => {
  await dbRun('DELETE FROM messages WHERE id = ?', [req.params.id]);
  res.json({ success: true });
});

app.get('/api/admin/stats', basicAuth, async (req, res) => {
  try {
    const total = (await dbGet('SELECT COUNT(*) as count FROM messages')).count;
    const unread = (await dbGet('SELECT COUNT(*) as count FROM messages WHERE read = 0')).count;
    const today = (await dbGet("SELECT COUNT(*) as count FROM messages WHERE date(created_at) = date('now')")).count;
    res.json({ total, unread, today });
  } catch (e) { res.status(500).json({ error: 'Sunucu hatası.' }); }
});

function fileAuth(req, res, next) {
  const token = req.headers['x-session-token'] || req.query.token;
  if (!token || !validSession(token)) return res.status(401).json({ error: 'Oturum geçersiz.' });
  next();
}

app.post('/api/file/login', (req, res) => {
  const { username, password } = req.body;
  if (username !== FILE_USER || password !== FILE_PASS)
    return res.status(401).json({ error: 'Kullanıcı adı veya şifre hatalı.' });
  res.json({ token: createSession() });
});

app.get('/api/file/check', fileAuth, (req, res) => res.json({ ok: true }));

app.post('/api/file/upload', fileAuth, upload.array('files', 20), (req, res) => {
  if (!req.files || req.files.length === 0) return res.status(400).json({ error: 'Dosya seçilmedi.' });
  res.json({ success: true, files: req.files.map(f => ({ filename: f.filename, original: f.originalname, size: f.size })) });
});

app.get('/api/file/list', fileAuth, (req, res) => {
  const files = fs.readdirSync(uploadsDir).map(name => {
    const stat = fs.statSync(path.join(uploadsDir, name));
    const parts = name.split('_');
    const original = parts.length > 1 ? parts.slice(1).join('_') : name;
    return { filename: name, original, size: stat.size, mtime: stat.mtime };
  }).sort((a, b) => new Date(b.mtime) - new Date(a.mtime));
  res.json({ files });
});

app.get('/api/file/download/:filename', fileAuth, (req, res) => {
  const safe = path.basename(req.params.filename);
  const filePath = path.join(uploadsDir, safe);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Dosya bulunamadı.' });
  const parts = safe.split('_');
  const original = parts.length > 1 ? parts.slice(1).join('_') : safe;
  res.download(filePath, original);
});

app.delete('/api/file/delete/:filename', fileAuth, (req, res) => {
  const safe = path.basename(req.params.filename);
  const filePath = path.join(uploadsDir, safe);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Dosya bulunamadı.' });
  fs.unlinkSync(filePath);
  res.json({ success: true });
});

app.get('/api/file/notes', fileAuth, async (req, res) => {
  const notes = await dbAll('SELECT * FROM notes ORDER BY pinned DESC, updated_at DESC');
  res.json({ notes });
});

app.post('/api/file/notes', fileAuth, async (req, res) => {
  const { title, content, color } = req.body;
  if (!title) return res.status(400).json({ error: 'Başlık zorunlu.' });
  const result = await dbRun('INSERT INTO notes (title, content, color) VALUES (?, ?, ?)', [title.trim(), content || '', color || 'default']);
  const note = await dbGet('SELECT * FROM notes WHERE id = ?', [result.lastID]);
  res.json({ note });
});

app.put('/api/file/notes/:id', fileAuth, async (req, res) => {
  const { title, content, pinned, color } = req.body;
  const note = await dbGet('SELECT * FROM notes WHERE id = ?', [req.params.id]);
  if (!note) return res.status(404).json({ error: 'Not bulunamadı.' });
  await dbRun('UPDATE notes SET title=?, content=?, pinned=?, color=?, updated_at=CURRENT_TIMESTAMP WHERE id=?',
    [title ?? note.title, content ?? note.content, pinned ?? note.pinned, color ?? note.color, req.params.id]);
  const updated = await dbGet('SELECT * FROM notes WHERE id = ?', [req.params.id]);
  res.json({ note: updated });
});

app.delete('/api/file/notes/:id', fileAuth, async (req, res) => {
  await dbRun('DELETE FROM notes WHERE id = ?', [req.params.id]);
  res.json({ success: true });
});

app.get('/file', (req, res) => res.sendFile(path.join(__dirname, 'file', 'login.html')));
app.get('/file/', (req, res) => res.redirect('/file'));
app.get('/file/app', (req, res) => res.sendFile(path.join(__dirname, 'file', 'index.html')));
app.use('/file/assets', express.static(path.join(__dirname, 'file'), { index: false }));

app.listen(PORT, () => {
  console.log(`Server: http://localhost:${PORT}`);
  console.log(`Admin:  http://localhost:${PORT}/admin`);
  console.log(`Files:  http://localhost:${PORT}/file`);
});