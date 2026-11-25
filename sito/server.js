// ================================================
//   VICE LIFE🌴  -  SERVER DEL SITO (parte insieme al bot)
//   Sito:          http://localhost:3000
//   Lato staff:    http://localhost:3000/admin  (con password)
//   Le modifiche fatte dal pannello vengono salvate in sito/dati/
//   e l'aggiornamento automatico non le tocca mai.
// ================================================
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { render } = require('./render');

const CARTELLA = __dirname;
const DATI = path.join(CARTELLA, 'dati');
const CARICATI = path.join(CARTELLA, 'caricati');
const FILE_CONTENUTI = path.join(DATI, 'contenuti.json');
const FILE_ADMIN = path.join(DATI, 'admin.json');
const PORTA = Number(process.env.SITO_PORTA) || 3000;
// 127.0.0.1 = il sito si apre solo dal tuo PC. Per metterlo online usa SITO_HOST=0.0.0.0 nel file .env
const HOST = process.env.SITO_HOST || '127.0.0.1';

const TIPI = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };

// ---------- contenuti ----------
function leggiContenuti() {
  fs.mkdirSync(DATI, { recursive: true });
  if (!fs.existsSync(FILE_CONTENUTI)) fs.copyFileSync(path.join(CARTELLA, 'predefiniti.json'), FILE_CONTENUTI);
  return JSON.parse(fs.readFileSync(FILE_CONTENUTI, 'utf8'));
}
function salvaContenuti(c) {
  fs.mkdirSync(DATI, { recursive: true });
  // tiene una copia di sicurezza della versione precedente
  if (fs.existsSync(FILE_CONTENUTI)) fs.copyFileSync(FILE_CONTENUTI, path.join(DATI, 'contenuti-precedenti.json'));
  fs.writeFileSync(FILE_CONTENUTI, JSON.stringify(c, null, 2));
}

// ---------- password ----------
const hash = (pw, sale) => crypto.scryptSync(String(pw), sale, 64).toString('hex');
function leggiAdmin() {
  fs.mkdirSync(DATI, { recursive: true });
  if (!fs.existsSync(FILE_ADMIN)) {
    // Prima volta: crea una password a caso e la scrive in un file (da cambiare dal pannello)
    const pw = `VL-${crypto.randomBytes(4).toString('hex')}`;
    const sale = crypto.randomBytes(16).toString('hex');
    fs.writeFileSync(FILE_ADMIN, JSON.stringify({ sale, hash: hash(pw, sale) }, null, 2));
    fs.writeFileSync(path.join(DATI, 'PASSWORD-INIZIALE.txt'),
      `Password iniziale del lato staff del sito VICE LIFE RP:\n\n${pw}\n\nCambiala dal pannello (http://localhost:${PORTA}/admin) e poi cancella questo file.\n`);
    console.log(`🔑 Password iniziale del sito: ${pw}  (salvata anche in sito/dati/PASSWORD-INIZIALE.txt)`);
  }
  return JSON.parse(fs.readFileSync(FILE_ADMIN, 'utf8'));
}
function passwordGiusta(pw) {
  const a = leggiAdmin();
  const prova = Buffer.from(hash(pw, a.sale), 'hex');
  return crypto.timingSafeEqual(prova, Buffer.from(a.hash, 'hex'));
}
function cambiaPassword(nuova) {
  const sale = crypto.randomBytes(16).toString('hex');
  fs.writeFileSync(FILE_ADMIN, JSON.stringify({ sale, hash: hash(nuova, sale) }, null, 2));
  fs.rmSync(path.join(DATI, 'PASSWORD-INIZIALE.txt'), { force: true });
}

// ---------- accessi ----------
const sessioni = new Map(); // token -> scadenza
const tentativi = new Map(); // ip -> [orari dei tentativi sbagliati]
const DURATA = 12 * 60 * 60 * 1000;
function token(req) {
  const t = (req.headers.cookie ?? '').split(';').map((x) => x.trim()).find((x) => x.startsWith('vl_staff='))?.slice(9);
  const scade = t && sessioni.get(t);
  if (!scade || scade < Date.now()) { if (t) sessioni.delete(t); return null; }
  return t;
}
const bloccato = (ip) => (tentativi.get(ip) ?? []).filter((x) => Date.now() - x < 10 * 60 * 1000).length >= 5;

// ---------- utilità http ----------
const invia = (res, codice, corpo, tipo = 'application/json', extra = {}) => {
  res.writeHead(codice, { 'Content-Type': tipo, 'X-Content-Type-Options': 'nosniff', ...extra });
  res.end(typeof corpo === 'string' || Buffer.isBuffer(corpo) ? corpo : JSON.stringify(corpo));
};
function leggiCorpo(req, max = 12 * 1024 * 1024) {
  return new Promise((ok, ko) => {
    let n = 0; const parti = [];
    req.on('data', (d) => { n += d.length; if (n > max) { ko(new Error('troppo grande')); req.destroy(); } else parti.push(d); });
    req.on('end', () => { try { ok(JSON.parse(Buffer.concat(parti).toString('utf8') || '{}')); } catch { ko(new Error('dati non validi')); } });
    req.on('error', ko);
  });
}
function file(res, percorso) {
  const pieno = path.normalize(path.join(CARTELLA, percorso));
  const consentito = [path.join(CARTELLA, 'img'), CARICATI].some((c) => pieno.startsWith(c + path.sep)) || pieno === path.join(CARTELLA, 'style.css');
  if (!consentito || !fs.existsSync(pieno) || !fs.statSync(pieno).isFile()) return invia(res, 404, 'Non trovato', 'text/plain');
  invia(res, 200, fs.readFileSync(pieno), TIPI[path.extname(pieno).toLowerCase()] ?? 'application/octet-stream', { 'Cache-Control': 'no-cache' });
}

// ---------- richieste ----------
async function gestisci(req, res) {
  const url = new URL(req.url, 'http://x');
  const p = decodeURIComponent(url.pathname);
  try {
    if (req.method === 'GET' && (p === '/' || p === '/index.html')) return invia(res, 200, render(leggiContenuti()), 'text/html; charset=utf-8');
    if (req.method === 'GET' && (p === '/admin' || p === '/admin/')) return invia(res, 200, fs.readFileSync(path.join(CARTELLA, 'admin.html')), 'text/html; charset=utf-8');
    if (req.method === 'GET' && (p.startsWith('/img/') || p.startsWith('/caricati/') || p === '/style.css')) return file(res, p.slice(1));

    if (p === '/api/login' && req.method === 'POST') {
      const ip = req.socket.remoteAddress;
      if (bloccato(ip)) return invia(res, 429, { errore: 'Troppi tentativi sbagliati: riprova tra 10 minuti.' });
      const { password } = await leggiCorpo(req, 10_000);
      if (!passwordGiusta(password ?? '')) {
        tentativi.set(ip, [...(tentativi.get(ip) ?? []), Date.now()]);
        return invia(res, 401, { errore: 'Password sbagliata.' });
      }
      tentativi.delete(ip);
      const t = crypto.randomBytes(32).toString('hex');
      sessioni.set(t, Date.now() + DURATA);
      return invia(res, 200, { ok: true }, 'application/json', { 'Set-Cookie': `vl_staff=${t}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${DURATA / 1000}` });
    }
    if (p === '/api/sessione') return invia(res, 200, { dentro: Boolean(token(req)) });

    // da qui in poi serve la password
    if (p.startsWith('/api/')) {
      const t = token(req);
      if (!t) return invia(res, 401, { errore: 'Devi accedere con la password.' });
      if (p === '/api/logout') { sessioni.delete(t); return invia(res, 200, { ok: true }, 'application/json', { 'Set-Cookie': 'vl_staff=; Path=/; Max-Age=0' }); }
      if (p === '/api/contenuti' && req.method === 'GET') return invia(res, 200, leggiContenuti());
      if (p === '/api/salva' && req.method === 'POST') {
        const c = await leggiCorpo(req);
        if (!c.generale || !c.home || !Array.isArray(c.sezioni)) return invia(res, 400, { errore: 'Contenuti non validi.' });
        render(c); // controlla che la pagina si possa costruire prima di salvare
        salvaContenuti(c);
        return invia(res, 200, { ok: true });
      }
      if (p === '/api/ripristina' && req.method === 'POST') {
        salvaContenuti(JSON.parse(fs.readFileSync(path.join(CARTELLA, 'predefiniti.json'), 'utf8')));
        return invia(res, 200, { ok: true });
      }
      if (p === '/api/carica' && req.method === 'POST') {
        const { nome, dati } = await leggiCorpo(req);
        const est = path.extname(String(nome ?? '')).toLowerCase();
        if (!['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(est)) return invia(res, 400, { errore: 'Puoi caricare solo immagini (jpg, png, gif, webp).' });
        const buf = Buffer.from(String(dati ?? '').replace(/^data:[^,]+,/, ''), 'base64');
        if (!buf.length) return invia(res, 400, { errore: 'Immagine vuota.' });
        fs.mkdirSync(CARICATI, { recursive: true });
        const nomeFile = `${Date.now().toString(36)}${est}`;
        fs.writeFileSync(path.join(CARICATI, nomeFile), buf);
        return invia(res, 200, { percorso: `caricati/${nomeFile}` });
      }
      if (p === '/api/password' && req.method === 'POST') {
        const { vecchia, nuova } = await leggiCorpo(req, 10_000);
        if (!passwordGiusta(vecchia ?? '')) return invia(res, 400, { errore: 'La password attuale è sbagliata.' });
        if (String(nuova ?? '').length < 8) return invia(res, 400, { errore: 'La nuova password deve avere almeno 8 caratteri.' });
        cambiaPassword(nuova);
        return invia(res, 200, { ok: true });
      }
      return invia(res, 404, { errore: 'Non trovato.' });
    }
    return invia(res, 404, 'Pagina non trovata', 'text/plain; charset=utf-8');
  } catch (e) {
    return invia(res, 500, { errore: e.message });
  }
}

function avvia() {
  leggiContenuti();
  leggiAdmin();
  const server = http.createServer((req, res) => { gestisci(req, res); });
  server.on('error', (e) => console.warn(`[sito] Non riesco ad avviare il sito: ${e.message}${e.code === 'EADDRINUSE' ? ` (la porta ${PORTA} è già usata)` : ''}`));
  server.listen(PORTA, HOST, () => console.log(`🌐 Sito: http://localhost:${PORTA}  •  Lato staff: http://localhost:${PORTA}/admin`));
  return server;
}

module.exports = { avvia, gestisci };
if (require.main === module) avvia(); // si può avviare anche da solo: node sito/server.js
