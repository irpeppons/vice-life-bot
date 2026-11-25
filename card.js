// ================================================
//   VICE LIFE🌴  -  IMMAGINE DI BENVENUTO (card con banner di sfondo)
// ================================================
const path = require('path');
const fs = require('fs');

// Installa da solo la libreria grafica se manca (serve solo la prima volta)
let canvasLib;
function lib() {
  if (canvasLib) return canvasLib;
  try { canvasLib = require('@napi-rs/canvas'); } catch {
    console.log('⏳ Installo la libreria per le immagini (solo la prima volta)...');
    require('child_process').execSync('npm install @napi-rs/canvas@0.1 --no-audit --no-fund', { cwd: __dirname, stdio: 'inherit' });
    canvasLib = require('@napi-rs/canvas');
  }
  return canvasLib;
}

const SFONDI_DIR = path.join(__dirname, 'sfondi');
const W = 1024; const H = 450;

const DEFAULT_CARD = {
  attiva: true,
  sfondo: '',            // '' = sfumatura colorata | 'file' = immagine caricata | link
  oscuramento: 40,       // 0-90 %
  riga1: 'BENVENUTO/A',
  riga2: '{username}',
  riga3: 'Sei il cittadino n° {membri}',
  font: 'Arial',
  coloreTesto: '#ffffff',
  accento: '#ff2d95',    // bordo avatar e cornice
  layout: 'centro',      // 'centro' | 'sinistra'
  forma: 'cerchio',      // 'cerchio' | 'quadrato'
  cornice: true,
};

const sfondoFile = (guildId) => path.join(SFONDI_DIR, `${guildId}.png`);

async function saveBackground(guildId, url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download fallito (${res.status})`);
  const buf = Buffer.from(await res.arrayBuffer());
  const { loadImage, createCanvas } = lib();
  const img = await loadImage(buf); // controlla che sia davvero un'immagine
  const c = createCanvas(img.width, img.height);
  c.getContext('2d').drawImage(img, 0, 0);
  fs.mkdirSync(SFONDI_DIR, { recursive: true });
  fs.writeFileSync(sfondoFile(guildId), await c.encode('png'));
}

async function load(src) {
  const { loadImage } = lib();
  if (!src) return null;
  try {
    if (/^https?:\/\//i.test(src)) {
      const res = await fetch(src);
      if (!res.ok) return null;
      return await loadImage(Buffer.from(await res.arrayBuffer()));
    }
    return fs.existsSync(src) ? await loadImage(fs.readFileSync(src)) : null;
  } catch { return null; }
}

function fitFont(ctx, text, font, size, maxW) {
  let s = size;
  do { ctx.font = `bold ${s}px "${font}", Arial, sans-serif`; s -= 2; } while (ctx.measureText(text).width > maxW && s > 12);
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

/**
 * Crea l'immagine di benvenuto.
 * @param {object} c   impostazioni card
 * @param {object} info { guildId, avatarURL, testi: [riga1, riga2, riga3] già compilati }
 */
async function renderCard(c, info) {
  const { createCanvas } = lib();
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');
  const accento = c.accento || DEFAULT_CARD.accento;

  // Sfondo
  const bgSrc = c.sfondo === 'file' ? sfondoFile(info.guildId) : c.sfondo;
  const bg = await load(bgSrc);
  if (bg) {
    const scale = Math.max(W / bg.width, H / bg.height); // effetto "copri tutto"
    const bw = bg.width * scale; const bh = bg.height * scale;
    ctx.drawImage(bg, (W - bw) / 2, (H - bh) / 2, bw, bh);
  } else {
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, accento); g.addColorStop(1, '#14002b');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  }
  // Oscuramento per leggere meglio il testo
  const dark = Math.min(90, Math.max(0, Number(c.oscuramento) || 0)) / 100;
  if (dark) { ctx.fillStyle = `rgba(0,0,0,${dark})`; ctx.fillRect(0, 0, W, H); }

  // Cornice
  if (c.cornice) {
    ctx.lineWidth = 8; ctx.strokeStyle = accento;
    roundRect(ctx, 14, 14, W - 28, H - 28, 26); ctx.stroke();
  }

  // Avatar
  const centro = c.layout !== 'sinistra';
  const r = centro ? 95 : 125;
  const ax = centro ? W / 2 : 70 + r;
  const ay = centro ? 40 + r : H / 2;
  const avatar = await load(info.avatarURL);
  ctx.save();
  ctx.beginPath();
  if (c.forma === 'quadrato') roundRect(ctx, ax - r, ay - r, r * 2, r * 2, 28); else ctx.arc(ax, ay, r, 0, Math.PI * 2);
  ctx.closePath();
  ctx.fillStyle = '#222'; ctx.fill();
  ctx.clip();
  if (avatar) ctx.drawImage(avatar, ax - r, ay - r, r * 2, r * 2);
  ctx.restore();
  ctx.lineWidth = 8; ctx.strokeStyle = accento;
  ctx.beginPath();
  if (c.forma === 'quadrato') roundRect(ctx, ax - r, ay - r, r * 2, r * 2, 28); else ctx.arc(ax, ay, r, 0, Math.PI * 2);
  ctx.stroke();

  // Testi
  const [t1, t2, t3] = info.testi;
  ctx.fillStyle = c.coloreTesto || '#ffffff';
  ctx.shadowColor = 'rgba(0,0,0,0.85)'; ctx.shadowBlur = 12; ctx.shadowOffsetY = 3;
  const font = c.font || 'Arial';
  if (centro) {
    ctx.textAlign = 'center';
    const maxW = W - 100;
    if (t1) { fitFont(ctx, t1, font, 60, maxW); ctx.fillText(t1, W / 2, 315); }
    if (t2) { fitFont(ctx, t2, font, 44, maxW); ctx.fillStyle = accento; ctx.fillText(t2, W / 2, 368); ctx.fillStyle = c.coloreTesto || '#fff'; }
    if (t3) { fitFont(ctx, t3, font, 28, maxW); ctx.fillText(t3, W / 2, 412); }
  } else {
    ctx.textAlign = 'left';
    const x = ax + r + 45; const maxW = W - x - 45;
    if (t1) { fitFont(ctx, t1, font, 62, maxW); ctx.fillText(t1, x, 175); }
    if (t2) { fitFont(ctx, t2, font, 48, maxW); ctx.fillStyle = accento; ctx.fillText(t2, x, 250); ctx.fillStyle = c.coloreTesto || '#fff'; }
    if (t3) { fitFont(ctx, t3, font, 30, maxW); ctx.fillText(t3, x, 310); }
  }
  return canvas.encode('png');
}

module.exports = { DEFAULT_CARD, renderCard, saveBackground, sfondoFile, lib };
