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
  sfondo: 'vicelife',    // 'vicelife' = banner VICE LIFE | 'file' = caricato | link | '' = sfumatura
  oscuramento: 0,        // 0-90 %
  riga1: '{username}',
  riga2: 'Sei il cittadino n° {membri}',
  riga3: '',
  font: 'Arial',
  coloreTesto: '#ffffff',
  accento: '#ff2d95',    // bordo avatar e cornice
  layout: 'profilo',     // 'profilo' (banner sopra, testo sotto) | 'centro' | 'sinistra'
  forma: 'cerchio',      // 'cerchio' | 'quadrato'
  cornice: true,
};

const sfondoFile = (guildId) => path.join(SFONDI_DIR, `${guildId}.png`);
const BANNER_VICELIFE = path.join(__dirname, 'banner-vicelife.jpg'); // banner ufficiale VICE LIFE RP

function percorsoSfondo(c, guildId) {
  if (c.sfondo === 'file') return sfondoFile(guildId);
  if (c.sfondo === 'vicelife') return BANNER_VICELIFE;
  return c.sfondo;
}

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
// Layout "profilo": banner intero in alto, avatar a cavallo, nome e testo sotto
async function renderProfilo(c, info) {
  const { createCanvas } = lib();
  const accento = c.accento || DEFAULT_CARD.accento;
  const bg = await load(percorsoSfondo(c, info.guildId));
  const BW = 1024;
  const BH = bg ? Math.min(420, Math.round(BW * bg.height / bg.width)) : 300;
  const R = 78; const SOTTO = 200;
  const canvas = createCanvas(BW, BH + SOTTO);
  const ctx = canvas.getContext('2d');

  // Parte bassa scura
  const g = ctx.createLinearGradient(0, BH, 0, BH + SOTTO);
  g.addColorStop(0, '#1a0526'); g.addColorStop(1, '#0b0012');
  ctx.fillStyle = g; ctx.fillRect(0, 0, BW, BH + SOTTO);

  // Banner
  if (bg) {
    const scale = Math.max(BW / bg.width, BH / bg.height);
    ctx.drawImage(bg, (BW - bg.width * scale) / 2, (BH - bg.height * scale) / 2, bg.width * scale, bg.height * scale);
  } else {
    const gb = ctx.createLinearGradient(0, 0, BW, BH);
    gb.addColorStop(0, accento); gb.addColorStop(1, '#14002b');
    ctx.fillStyle = gb; ctx.fillRect(0, 0, BW, BH);
  }
  const dark = Math.min(90, Math.max(0, Number(c.oscuramento) || 0)) / 100;
  if (dark) { ctx.fillStyle = `rgba(0,0,0,${dark})`; ctx.fillRect(0, 0, BW, BH); }
  ctx.fillStyle = accento; ctx.fillRect(0, BH - 3, BW, 6); // linea colorata tra banner e testo

  // Avatar a cavallo della linea
  const ax = BW / 2; const ay = BH;
  const avatar = await load(info.avatarURL);
  const forma = () => { ctx.beginPath(); if (c.forma === 'quadrato') roundRect(ctx, ax - R, ay - R, R * 2, R * 2, 22); else ctx.arc(ax, ay, R, 0, Math.PI * 2); ctx.closePath(); };
  ctx.save(); forma(); ctx.fillStyle = '#222'; ctx.fill(); ctx.clip();
  if (avatar) ctx.drawImage(avatar, ax - R, ay - R, R * 2, R * 2);
  ctx.restore();
  ctx.lineWidth = 7; ctx.strokeStyle = accento; forma(); ctx.stroke();

  // Testi sotto
  const testi = info.testi.filter(Boolean);
  const font = c.font || 'Arial';
  ctx.textAlign = 'center';
  ctx.shadowColor = 'rgba(0,0,0,0.8)'; ctx.shadowBlur = 8;
  const sizes = [46, 30, 24];
  let y = BH + R + 52;
  testi.forEach((t, n) => {
    fitFont(ctx, t, font, sizes[n] ?? 24, BW - 80);
    ctx.fillStyle = n === 1 ? accento : (c.coloreTesto || '#ffffff');
    ctx.fillText(t, BW / 2, y);
    y += (sizes[n + 1] ?? 24) + 16;
  });

  if (c.cornice) {
    ctx.shadowBlur = 0; ctx.lineWidth = 8; ctx.strokeStyle = accento;
    roundRect(ctx, 4, 4, BW - 8, BH + SOTTO - 8, 22); ctx.stroke();
  }
  return canvas.encode('png');
}

async function renderCard(c, info) {
  if (c.layout === 'profilo') return renderProfilo(c, info);
  const { createCanvas } = lib();
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');
  const accento = c.accento || DEFAULT_CARD.accento;

  // Sfondo
  const bg = await load(percorsoSfondo(c, info.guildId));
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
