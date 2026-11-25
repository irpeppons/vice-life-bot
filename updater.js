// ================================================
//   VICE LIFE🌴  -  AGGIORNAMENTO AUTOMATICO DA GITHUB
//   All'avvio e ogni 5 minuti controlla se su GitHub c'è una versione nuova.
//   Se c'è, scarica i file, li sostituisce e riavvia il bot (codice 42).
//   Non tocca mai: .env (token), data.json (impostazioni), sfondi/, file .bat
// ================================================
const fs = require('fs');
const path = require('path');

const REPO = 'irpeppons/vice-life-bot';
const BRANCH = 'main';
const OGNI_MS = 5 * 60 * 1000;
const VERSIONE = path.join(__dirname, '.versione');
const HEADERS = { 'User-Agent': 'vice-life-bot-updater', Accept: 'application/vnd.github+json' };

const permesso = (p) => !p.startsWith('.') && !p.includes('/.') && p !== 'data.json'
  && !p.startsWith('sfondi/') && !p.startsWith('node_modules/') && !p.endsWith('.bat') && !p.includes('..');

async function controlla({ silenzioso = false } = {}) {
  try {
    const res = await fetch(`https://api.github.com/repos/${REPO}/commits/${BRANCH}`, { headers: HEADERS });
    if (!res.ok) { if (!silenzioso) console.log(`ℹ️  Controllo aggiornamenti non riuscito (${res.status})`); return false; }
    const sha = (await res.json()).sha;
    const attuale = fs.existsSync(VERSIONE) ? fs.readFileSync(VERSIONE, 'utf8').trim() : '';
    if (sha === attuale) { if (!silenzioso) console.log('✅ Il bot è aggiornato all\'ultima versione'); return false; }

    const tree = await (await fetch(`https://api.github.com/repos/${REPO}/git/trees/${sha}?recursive=1`, { headers: HEADERS })).json();
    const cambiati = [];
    for (const f of tree.tree ?? []) {
      if (f.type !== 'blob' || !permesso(f.path)) continue;
      const r = await fetch(`https://raw.githubusercontent.com/${REPO}/${sha}/${f.path}`);
      if (!r.ok) throw new Error(`download di ${f.path} fallito (${r.status})`);
      const nuovo = Buffer.from(await r.arrayBuffer());
      const dest = path.join(__dirname, f.path);
      if (fs.existsSync(dest) && fs.readFileSync(dest).equals(nuovo)) continue;
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, nuovo);
      cambiati.push(f.path);
    }
    fs.writeFileSync(VERSIONE, sha);
    if (!cambiati.length) return false;

    console.log(`⬇️  Aggiornamento scaricato: ${cambiati.join(', ')}`);
    if (cambiati.includes('package.json')) {
      console.log('📦 Installo le nuove librerie...');
      require('child_process').execSync('npm install --no-audit --no-fund', { cwd: __dirname, stdio: 'inherit' });
    }
    return true;
  } catch (e) {
    if (!silenzioso) console.log(`ℹ️  Controllo aggiornamenti non riuscito: ${e.message}`);
    return false;
  }
}

function riavvia() {
  console.log('🔄 Riavvio il bot con la nuova versione...');
  setTimeout(() => process.exit(42), 500);
}

// Controlla subito all'avvio (prima di accendere il bot) e poi ogni 5 minuti
async function avvia() {
  if (await controlla()) { riavvia(); return false; }
  setInterval(async () => { if (await controlla({ silenzioso: true })) riavvia(); }, OGNI_MS);
  return true;
}

module.exports = { avvia, controlla };
