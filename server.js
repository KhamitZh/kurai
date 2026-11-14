// NNN Куратор — жергілікті сервер.
// Сайтты http://localhost:4747 мекенжайында ашады және деректерді
// куратордың компьютеріндегі папкаға сақтайды (алғаш ашқанда таңдалады).
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const os = require('os');
const crypto = require('crypto');

const PORT = 4747;
const ROOT = __dirname;
const PUBLIC = path.join(ROOT, 'public');
const APP_CONFIG = path.join(ROOT, 'config.json');

// ---- Компьютерге тән баптаулар (config.json — GitHub-қа жүктелмейді) ----
// dataRoot — деректер папкасы, pinHash — телефоннан кіру PIN-кодының хеші
let appConfig = {};
try { appConfig = JSON.parse(fs.readFileSync(APP_CONFIG, 'utf8')) || {}; } catch (_) { /* алғашқы іске қосу */ }
const DEFAULT_DATA_ROOT = path.join(os.homedir(), 'Documents', 'NNN Куратор');
let DATA_ROOT = appConfig.dataRoot || DEFAULT_DATA_ROOT;

function saveAppConfig() {
  fs.writeFileSync(APP_CONFIG, JSON.stringify(appConfig, null, 2), 'utf8');
}

// ---- Телефоннан кіру (бір Wi-Fi желісінде), PIN-кодпен қорғалған ----
// PIN-код 6 саннан тұрады және config.json-да тек хеш түрінде сақталады.
const LAN = process.argv.includes('--lan') || appConfig.lan === true;
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const pinHashOf = (pin) => sha('nnn-kurator:' + pin);
let PIN_HASH = appConfig.pinHash || (appConfig.pin ? pinHashOf(String(appConfig.pin)) : null);
let AUTH_TOKEN = null;
function setPinHash(hash) {
  PIN_HASH = hash;
  AUTH_TOKEN = hash ? sha('cookie:' + hash) : null;
}
setPinHash(PIN_HASH);
let NEW_PIN = null; // тек жаңадан жасалған кезде консольге шығарылады
if (LAN && !PIN_HASH) {
  NEW_PIN = String(crypto.randomInt(100000, 1000000));
  appConfig.pinHash = pinHashOf(NEW_PIN);
  delete appConfig.pin;
  try { saveAppConfig(); } catch (_) {}
  setPinHash(appConfig.pinHash);
}
const checkPin = (input) => /^d{6}$/.test(input) && PIN_HASH && pinHashOf(input) === PIN_HASH;
const failed = new Map(); // ip -> {count, until}

function isLocal(req) {
  const a = req.socket.remoteAddress || '';
  return a === '127.0.0.1' || a === '::1' || a === '::ffff:127.0.0.1';
}
function hasAuth(req) {
  const m = (req.headers.cookie || '').match(/(?:^|;\s*)nnn_auth=([a-f0-9]+)/);
  return !!(m && AUTH_TOKEN && m[1] === AUTH_TOKEN);
}
function lanAddresses() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const i of list || []) if (i.family === 'IPv4' && !i.internal) out.push(i.address);
  }
  return out;
}

const LOGIN_PAGE = (msg = '') => `<!doctype html><html lang="kk"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>NNN Куратор — кіру</title>
<link rel="icon" href="/assets/favicon.png"><meta name="theme-color" content="#1D2E28">
<style>
body{margin:0;min-height:100vh;display:grid;place-items:center;background:#1D2E28;font-family:"Segoe UI",system-ui,sans-serif;color:#000;padding:16px;box-sizing:border-box}
form{background:#fff;border-radius:24px;padding:28px 24px;width:100%;max-width:340px;box-sizing:border-box;text-align:center}
img{width:64px;height:auto}h1{font-size:20px;margin:14px 0 6px}p{color:#4a5a53;margin:0 0 18px;font-size:14px}
input{width:100%;box-sizing:border-box;font-size:26px;letter-spacing:.3em;text-align:center;padding:12px;border:1.5px solid #C3CFC8;border-radius:14px}
input:focus{outline:none;border-color:#085D36;box-shadow:0 0 0 3px rgba(8,93,54,.15)}
button{margin-top:14px;width:100%;padding:14px;border:0;border-radius:14px;background:#085D36;color:#fff;font-size:16px;font-weight:600}
.err{color:#C0362C;margin:12px 0 0;font-size:14px}
</style></head><body><form method="post" action="/login">
<img src="/assets/logo-mark-blue.png" alt="NN Online"><h1>NNN Куратор</h1>
<p>6 санды PIN-кодты жазыңыз</p>
<input name="pin" inputmode="numeric" autocomplete="one-time-code" maxlength="6" pattern="[0-9]{6}" type="password" autofocus required>
<button type="submit">Кіру</button>${msg ? `<div class="err">${msg}</div>` : ''}</form></body></html>`;

const SETTINGS_FILE = () => path.join(DATA_ROOT, 'nnn-kurator-settings.json');
const GROUP_DATA_NAME = 'nnn-kurator-data.json';

const VENDOR = {
  '/vendor/exceljs.min.js': 'node_modules/exceljs/dist/exceljs.min.js',
  '/vendor/pptxgen.bundle.js': 'node_modules/pptxgenjs/dist/pptxgen.bundle.js',
};

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.json': 'application/json; charset=utf-8',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
};

function send(res, code, body, type = 'application/json; charset=utf-8') {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

function readBody(req, limit = 60 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { reject(new Error('Too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function readJSON(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (_) { return fallback; }
}

// Қауіпсіз жазу: алдымен уақытша файл, ескісін .backup етіп сақтау
function writeJSONSafe(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  if (fs.existsSync(file)) {
    try { fs.copyFileSync(file, file.replace(/\.json$/, '.backup.json')); } catch (_) {}
  }
  fs.renameSync(tmp, file);
}

function settingsGroups() {
  const s = readJSON(SETTINGS_FILE(), null);
  return (s && Array.isArray(s.groups)) ? s.groups : [];
}

function groupFolder(groupId) {
  const g = settingsGroups().find((x) => x.id === groupId);
  if (!g || !g.folder) return null;
  return path.resolve(g.folder);
}

function safeFileName(name) {
  const base = String(name || '').replace(/[\\/:*?"<>|]/g, '_').trim();
  if (!base || base.startsWith('.')) return null;
  return base;
}

async function handleApi(req, res, url) {
  const p = url.pathname;

  if (p === '/api/settings' && req.method === 'GET') {
    return send(res, 200, {
      dataRoot: DATA_ROOT,
      settings: readJSON(SETTINGS_FILE(), null),
      app: { hasPin: !!PIN_HASH, isLocal: isLocal(req), dataRootChosen: !!appConfig.dataRoot, defaultDataRoot: DEFAULT_DATA_ROOT },
    });
  }

  // Компьютер баптаулары: деректер папкасы және PIN-код. Тек компьютердің өзінен өзгертіледі.
  if (p === '/api/app' && req.method === 'POST') {
    if (!isLocal(req)) return send(res, 403, { error: 'Бұл баптауды тек компьютердің өзінен өзгертуге болады' });
    const body = JSON.parse(await readBody(req, 100000));
    if (body.dataRoot != null) {
      const dir = String(body.dataRoot).trim();
      if (!dir || !path.isAbsolute(dir)) return send(res, 400, { error: 'Папканың толық жолын жазыңыз, мысалы D:\\NNN' });
      try { fs.mkdirSync(dir, { recursive: true }); } catch (e) {
        return send(res, 400, { error: `Папка ашылмады: ${dir}. Диск бар екенін тексеріңіз.` });
      }
      DATA_ROOT = path.resolve(dir);
      appConfig.dataRoot = DATA_ROOT;
    }
    if (body.pin != null && body.pin !== '') {
      const pin = String(body.pin).trim();
      if (!/^\d{6}$/.test(pin)) return send(res, 400, { error: 'PIN-код 6 саннан тұруы керек' });
      appConfig.pinHash = pinHashOf(pin);
      delete appConfig.pin;
      setPinHash(appConfig.pinHash);
    }
    saveAppConfig();
    return send(res, 200, { ok: true, dataRoot: DATA_ROOT, settings: readJSON(SETTINGS_FILE(), null), hasPin: !!PIN_HASH });
  }
  if (p === '/api/settings' && req.method === 'PUT') {
    const data = JSON.parse(await readBody(req));
    writeJSONSafe(SETTINGS_FILE(), data);
    for (const g of data.groups || []) {
      if (g.folder) fs.mkdirSync(path.resolve(g.folder), { recursive: true });
    }
    return send(res, 200, { ok: true });
  }

  const m = p.match(/^\/api\/group\/([\w-]+)$/);
  if (m) {
    const folder = groupFolder(m[1]);
    if (!folder) return send(res, 404, { error: 'Топ табылмады' });
    const file = path.join(folder, GROUP_DATA_NAME);
    if (req.method === 'GET') return send(res, 200, { data: readJSON(file, null), folder });
    if (req.method === 'PUT') {
      const data = JSON.parse(await readBody(req));
      writeJSONSafe(file, data);
      return send(res, 200, { ok: true });
    }
  }

  const f = p.match(/^\/api\/group\/([\w-]+)\/file$/);
  if (f && req.method === 'POST') {
    const folder = groupFolder(f[1]);
    if (!folder) return send(res, 404, { error: 'Топ табылмады' });
    const { name, base64 } = JSON.parse(await readBody(req));
    const fname = safeFileName(name);
    if (!fname) return send(res, 400, { error: 'Файл аты дұрыс емес' });
    fs.mkdirSync(folder, { recursive: true });
    const full = path.join(folder, fname);
    try {
      fs.writeFileSync(full, Buffer.from(base64, 'base64'));
    } catch (e) {
      if (e.code === 'EBUSY' || e.code === 'EPERM') {
        return send(res, 409, { error: `«${fname}» файлы ашық тұр (Excel не PowerPoint-те). Оны жауып, қайта басыңыз.` });
      }
      throw e;
    }
    return send(res, 200, { ok: true, path: full });
  }

  const o = p.match(/^\/api\/group\/([\w-]+)\/open$/);
  if (o && req.method === 'POST') {
    const folder = groupFolder(o[1]);
    if (!folder) return send(res, 404, { error: 'Топ табылмады' });
    fs.mkdirSync(folder, { recursive: true });
    exec(`explorer "${folder}"`);
    return send(res, 200, { ok: true });
  }

  return send(res, 404, { error: 'Not found' });
}

function serveStatic(req, res, url) {
  let rel = decodeURIComponent(url.pathname);
  let file;
  if (VENDOR[rel]) file = path.join(ROOT, VENDOR[rel]);
  else if (rel.startsWith('/fonts/')) {
    file = path.join(ROOT, 'node_modules/@fontsource', rel.slice('/fonts/'.length));
    if (!file.startsWith(path.join(ROOT, 'node_modules', '@fontsource'))) return send(res, 403, 'Forbidden', 'text/plain');
  } else {
    if (rel === '/') rel = '/index.html';
    file = path.join(PUBLIC, rel);
    if (!file.startsWith(PUBLIC)) return send(res, 403, 'Forbidden', 'text/plain');
  }
  fs.readFile(file, (err, buf) => {
    if (err) return send(res, 404, 'Not found', 'text/plain');
    send(res, 200, buf, MIME[path.extname(file).toLowerCase()] || 'application/octet-stream');
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  try {
    // Компьютердің өзінен емес (телефоннан) келген сұраулар PIN-кодты талап етеді
    if (!isLocal(req) && !hasAuth(req)) {
      const ip = req.socket.remoteAddress;
      if (url.pathname === '/login' && req.method === 'POST') {
        const f = failed.get(ip) || { count: 0, until: 0 };
        if (f.until > Date.now()) return send(res, 429, LOGIN_PAGE('Тым көп қате. 5 минуттан кейін қайталаңыз.'), 'text/html; charset=utf-8');
        const pin = new URLSearchParams(await readBody(req, 10000)).get('pin') || '';
        if (checkPin(pin.trim())) {
          failed.delete(ip);
          res.writeHead(303, { 'Set-Cookie': `nnn_auth=${AUTH_TOKEN}; Path=/; Max-Age=31536000; HttpOnly; SameSite=Strict`, Location: '/' });
          return res.end();
        }
        f.count++; if (f.count >= 5) { f.count = 0; f.until = Date.now() + 5 * 60 * 1000; }
        failed.set(ip, f);
        return send(res, 401, LOGIN_PAGE('PIN-код қате'), 'text/html; charset=utf-8');
      }
      if (url.pathname.startsWith('/assets/')) return serveStatic(req, res, url);
      if (url.pathname.startsWith('/api/')) return send(res, 401, { error: 'PIN-кодпен кіріңіз' });
      return send(res, 200, LOGIN_PAGE(), 'text/html; charset=utf-8');
    }
    if (url.pathname.startsWith('/api/')) return await handleApi(req, res, url);
    return serveStatic(req, res, url);
  } catch (e) {
    console.error(e);
    return send(res, 500, { error: e.message || 'Сервер қатесі' });
  }
});

const OPEN = process.argv.includes('--open');
function openBrowser() { if (OPEN) exec(`start "" "http://localhost:${PORT}"`); }

server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    console.log(`Сайт бұрыннан қосулы тұр: http://localhost:${PORT}`);
    openBrowser();
    setTimeout(() => process.exit(0), 1500);
    return;
  }
  throw e;
});

server.listen(PORT, LAN ? '0.0.0.0' : '127.0.0.1', () => {
  console.log('');
  console.log('  NNN Куратор қосылды');
  console.log(`  Сайт:     http://localhost:${PORT}`);
  console.log(`  Деректер: ${DATA_ROOT}`);
  console.log('');
  if (LAN) {
    const ips = lanAddresses();
    console.log('  ТЕЛЕФОННАН АШУ (компьютер мен телефон бір Wi-Fi-да болуы керек):');
    ips.forEach((ip) => console.log(`     http://${ip}:${PORT}`));
    if (!ips.length) console.log('     Wi-Fi желісі табылмады.');
    console.log(NEW_PIN
      ? `  Жаңа PIN-код: ${NEW_PIN}  (жазып алыңыз — бұдан кейін көрсетілмейді)`
      : '  PIN-код: өзіңіз орнатқан 6 сан');
    console.log('');
  }
  console.log('  Бұл терезені жаппаңыз — жапсаңыз, сайт жұмысын тоқтатады.');
  openBrowser();
});
