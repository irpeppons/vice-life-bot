// ================================================
//   VICE LIFE🌴  -  Costruisce la pagina del sito dai contenuti
//   (i contenuti si modificano dal pannello staff: /admin)
// ================================================
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const colore = (c, def) => (/^#[0-9a-f]{6}$/i.test(c ?? '') ? c : def);

// Link sicuri: http(s), #sezione, mailto, oppure {discord} / {server}
function link(l, g) {
  const x = String(l ?? '').replace('{discord}', g.linkDiscord || '#').replace('{server}', g.linkServer || '#').trim();
  return /^(https?:\/\/|#|mailto:|\/)/i.test(x) ? x : '#';
}
const esterno = (h) => (/^https?:/i.test(h) ? ' target="_blank" rel="noopener"' : '');
const img = (src) => (/^(img|caricati)\/[\w.\-]+$/.test(src ?? '') ? src : '');

function carte(elementi, tipo) {
  return elementi.map((e) => {
    const foto = img(e.immagine);
    if (tipo === 'testi') return `<div class="carta sinistra"><h3>${esc(e.icona)} ${esc(e.titolo)}</h3><p>${esc(e.testo)}</p></div>`;
    if (tipo === 'staff') {
      const av = foto ? `<div class="avatar"><img src="${foto}" alt=""></div>` : `<div class="avatar">${esc(e.icona)}</div>`;
      return `<div class="carta staff">${av}<h3>${esc(e.titolo)}</h3><p>${esc(e.testo)}</p></div>`;
    }
    const ic = foto ? `<img class="foto" src="${foto}" alt="">` : `<div class="icona">${esc(e.icona)}</div>`;
    return `<div class="carta">${ic}<h3>${esc(e.titolo)}</h3><p>${esc(e.testo)}</p></div>`;
  }).join('\n');
}

function sezione(s, n, g) {
  const el = s.elementi ?? [];
  const col = { 2: 'due', 3: 'tre', 4: 'quattro', 5: 'cinque' }[s.colonne] ?? 'quattro';
  const corpo = s.tipo === 'passi'
    ? `${s.sottotitolo ? `<h3 class="sottotitolo">${esc(s.sottotitolo)}</h3>` : ''}<div class="passi">${el.map((e) => `<div class="passo"><span>${esc(e.icona)}</span><h4>${esc(e.titolo)}</h4><p>${esc(e.testo)}</p></div>`).join('')}</div>`
    : `<div class="carte ${col}">${carte(el, s.tipo)}</div>`;
  const bot = s.bottone?.testo ? `<div class="centro"><a href="${link(s.bottone.link, g)}"${esterno(link(s.bottone.link, g))} class="btn vuoto">${esc(s.bottone.testo)}</a></div>` : '';
  return `
  <section id="${esc(s.id || `sezione${n}`)}" class="sezione${n % 2 ? ' scura' : ''}">
    <h2>${esc(s.titolo)} <span class="rosa">${esc(s.evidenziato)}</span> ${esc(s.titoloDopo)}</h2>
    ${s.intro ? `<p class="intro">${esc(s.intro)}</p>` : ''}
    ${corpo}
    ${bot}
  </section>`;
}

function render(c) {
  const g = c.generale; const h = c.home; const ch = c.chiusura;
  const sezioni = (c.sezioni ?? []).filter((s) => !s.nascosta);
  const menu = sezioni.filter((s) => s.menu).map((s, n) => `<a href="#${esc(s.id || `sezione${n}`)}">${esc(s.menu)}</a>`).join('\n      ');
  const disc = link('{discord}', g);
  return `<!doctype html>
<html lang="it">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(g.titoloScheda)}</title>
  <meta name="description" content="${esc(g.descrizione)}">
  <link rel="icon" href="${img(g.logo) || 'img/logo.jpg'}">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;600;800;900&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="style.css">
  <style>:root{--rosa:${colore(g.colori?.rosa, '#ff2d95')};--viola:${colore(g.colori?.viola, '#7b2ff7')};--sfondo:${colore(g.colori?.sfondo, '#0b0612')};}
  .hero-bg{background-image:linear-gradient(180deg,rgba(0,0,0,0) 55%,rgba(0,0,0,.55) 82%,var(--sfondo) 100%),url('${img(g.banner) || 'img/hero.jpg'}')}</style>
</head>
<body>
  <header class="nav">
    <a href="#home" class="logo"><img src="${img(g.logo) || 'img/logo.jpg'}" alt=""><span>${esc(g.nome)} <b>${esc(g.nomeEvidenziato)}</b></span></a>
    <input type="checkbox" id="menu" hidden>
    <label for="menu" class="burger" aria-label="Apri il menu">☰</label>
    <nav>
      <a href="#home" class="attivo">🏠 Home</a>
      ${menu}
      <a href="${disc}"${esterno(disc)}>💬 Discord</a>
      ${g.testoAccedi ? `<a href="${disc}"${esterno(disc)} class="btn piccolo pieno">${esc(g.testoAccedi)}</a>` : ''}
    </nav>
  </header>

  <section id="home" class="hero">
    <div class="hero-bg"></div>
    <div class="hero-testo">
      <h1>${esc(h.riga1)}<br>${esc(h.riga2)} <span class="rosa">${esc(h.evidenziato)}</span></h1>
      <div class="linea"></div>
      <div class="bottoni">
        ${(h.bottoni ?? []).map((b) => `<a href="${link(b.link, g)}"${esterno(link(b.link, g))} class="btn ${b.stile === 'vuoto' ? 'vuoto' : 'pieno'} grande">${esc(b.testo)}</a>`).join('\n        ')}
      </div>
    </div>
    ${(h.carte ?? []).length ? `<div class="carte cinque">${carte(h.carte, 'carte')}</div>` : ''}
  </section>
${sezioni.map((s, n) => sezione(s, n, g)).join('\n')}

  <section id="discord" class="cta">
    <h2>${esc(ch.titolo)} <span class="rosa">${esc(ch.evidenziato)}</span></h2>
    <p>${esc(ch.testo)}</p>
    ${ch.bottone?.testo ? `<a href="${link(ch.bottone.link, g)}"${esterno(link(ch.bottone.link, g))} class="btn pieno grande">${esc(ch.bottone.testo)}</a>` : ''}
  </section>

  <footer>
    <img src="${img(g.logo) || 'img/logo.jpg'}" alt="">
    <p>${esc(c.footer?.testo)}</p>
    <p class="piccolo">${esc(c.footer?.copyright)}</p>
  </footer>

  <script>
    const voci=[...document.querySelectorAll('nav a[href^="#"]')];const sez=voci.map(a=>document.querySelector(a.getAttribute('href')));
    addEventListener('scroll',()=>{let x=0;sez.forEach((s,n)=>{if(s&&s.getBoundingClientRect().top<140)x=n});voci.forEach((a,n)=>a.classList.toggle('attivo',n===x))});
    voci.forEach(a=>a.addEventListener('click',()=>{document.getElementById('menu').checked=false}));
  </script>
</body>
</html>`;
}

module.exports = { render };
