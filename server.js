require('dotenv').config();
const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASS || 'changeme';

const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir);

const db = new Database(path.join(dataDir, 'messages.db'));

db.exec(`
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    subject TEXT NOT NULL,
    message TEXT NOT NULL,
    ip TEXT,
    read INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

app.use(express.json());
app.use(express.static(__dirname));

app.post('/api/contact', (req, res) => {
  const { name, email, subject, message } = req.body;
  if (!name || !email || !subject || !message) {
    return res.status(400).json({ error: 'Tüm alanlar zorunlu.' });
  }
  if (name.length > 100 || email.length > 100 || subject.length > 200 || message.length > 2000) {
    return res.status(400).json({ error: 'Girdi çok uzun.' });
  }
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  const stmt = db.prepare('INSERT INTO messages (name, email, subject, message, ip) VALUES (?, ?, ?, ?, ?)');
  stmt.run(name.trim(), email.trim(), subject.trim(), message.trim(), ip);
  res.json({ success: true });
});

const loginAttempts = new Map();
const MAX_ATTEMPTS = 5;
const LOCK_MS = 15 * 60 * 1000;
const ATTEMPT_WINDOW_MS = 10 * 60 * 1000;

function getClientIp(req) {
  return (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
}

function isLocked(ip) {
  const entry = loginAttempts.get(ip);
  if (!entry) return false;
  if (entry.lockedUntil && Date.now() < entry.lockedUntil) return true;
  if (entry.lockedUntil && Date.now() >= entry.lockedUntil) {
    loginAttempts.delete(ip);
    return false;
  }
  return false;
}

function recordFailure(ip) {
  const now = Date.now();
  let entry = loginAttempts.get(ip) || { attempts: [], lockedUntil: null };
  entry.attempts = entry.attempts.filter(t => now - t < ATTEMPT_WINDOW_MS);
  entry.attempts.push(now);
  if (entry.attempts.length >= MAX_ATTEMPTS) {
    entry.lockedUntil = now + LOCK_MS;
  }
  loginAttempts.set(ip, entry);
}

function recordSuccess(ip) {
  loginAttempts.delete(ip);
}

function getRemainingLock(ip) {
  const entry = loginAttempts.get(ip);
  if (!entry || !entry.lockedUntil) return 0;
  return Math.ceil((entry.lockedUntil - Date.now()) / 1000 / 60);
}

setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of loginAttempts.entries()) {
    if (entry.lockedUntil && now > entry.lockedUntil + 60000) loginAttempts.delete(ip);
    else if (!entry.lockedUntil && entry.attempts.every(t => now - t > ATTEMPT_WINDOW_MS)) loginAttempts.delete(ip);
  }
}, 5 * 60 * 1000);

function basicAuth(req, res, next) {
  const ip = getClientIp(req);

  if (isLocked(ip)) {
    const mins = getRemainingLock(ip);
    return res.status(429).send(`Çok fazla hatalı giriş. ${mins} dakika sonra tekrar deneyin.`);
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
    if (isLocked(ip)) {
      return res.status(429).send(`Çok fazla hatalı giriş. 15 dakika kilitleme aktif.`);
    }
    return res.status(401).send(`Kullanıcı adı veya şifre hatalı. ${remaining > 0 ? remaining + ' deneme hakkı kaldı.' : ''}`);
  }

  recordSuccess(ip);
  next();
}

app.get('/admin', basicAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'admin.html'));
});

app.get('/api/admin/messages', basicAuth, (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = 20;
  const offset = (page - 1) * limit;
  const unread = req.query.unread === '1';
  const where = unread ? 'WHERE read = 0' : '';
  const total = db.prepare(`SELECT COUNT(*) as count FROM messages ${where}`).get().count;
  const messages = db.prepare(`SELECT * FROM messages ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`).all(limit, offset);
  res.json({ messages, total, page, pages: Math.ceil(total / limit) });
});

app.patch('/api/admin/messages/:id/read', basicAuth, (req, res) => {
  db.prepare('UPDATE messages SET read = 1 WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

app.delete('/api/admin/messages/:id', basicAuth, (req, res) => {
  db.prepare('DELETE FROM messages WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

app.get('/api/admin/stats', basicAuth, (req, res) => {
  const total = db.prepare('SELECT COUNT(*) as count FROM messages').get().count;
  const unread = db.prepare('SELECT COUNT(*) as count FROM messages WHERE read = 0').get().count;
  const today = db.prepare("SELECT COUNT(*) as count FROM messages WHERE date(created_at) = date('now')").get().count;
  res.json({ total, unread, today });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Admin panel: http://localhost:${PORT}/admin`);
});