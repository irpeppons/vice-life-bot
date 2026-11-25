// ================================================
//   VICE LIFE🌴  -  ANNUNCI, LINK, SONDAGGI, GIVEAWAY
//   /annunci   -> annuncio personalizzato con il banner
//   /link      -> pannello link (Discord, social...) tutto personalizzabile
//   /sondaggi  -> sondaggio con 1 voto per player
//   /giveaway  -> giveaway con 1 vincitore estratto a caso alla scadenza
//   /spoiler   -> immagini censurate (si preme sopra per vederle)
// ================================================
const path = require('path');
const {
  ChannelType, PermissionFlagsBits, MessageFlags, EmbedBuilder, SlashCommandBuilder, AttachmentBuilder,
  ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, ChannelSelectMenuBuilder,
  ModalBuilder, TextInputBuilder, TextInputStyle,
} = require('discord.js');

const EPH = MessageFlags.Ephemeral;
// Banner pronti: si scrivono come parola nel campo immagine
const BANNERS = {
  vicelife: 'banner-vicelife.jpg', // VICE LIFE RP
  discord: 'banner-discord.jpg',   // VICE LIFE RP DISCORD
  ticket: 'banner-ticket.jpg',     // VICE LIFE RP TICKET
};
const ROSA = '#ff2d95';
let cfg; let save;

// ---------- utilità ----------
const isUrl = (s) => /^https?:\/\/\S+$/i.test(s);
const isEmoji = (s) => /^<a?:\w{2,32}:\d{17,20}>$/.test(s)
  || (s.length <= 16 && /\p{Extended_Pictographic}|\p{Regional_Indicator}/u.test(s) && !/[a-z]/i.test(s));
const hex = (s, def) => { if (!s) return def; const h = s.startsWith('#') ? s : `#${s}`; return /^#[0-9a-f]{6}$/i.test(h) ? h : def; };
const nuovoId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
const staff = (i) => i.memberPermissions?.has(PermissionFlagsBits.ManageGuild);
const ts = (ms) => Math.floor(ms / 1000);

// "1g 12h", "2 giorni", "30m", "1 ora" -> millisecondi
function durata(s) {
  let ms = 0;
  for (const [, n, u] of String(s || '').matchAll(/(\d+)\s*(g|d|h|o|m)/gi)) {
    ms += Number(n) * ({ g: 864e5, d: 864e5, h: 36e5, o: 36e5, m: 6e4 })[u.toLowerCase()];
  }
  return ms || null;
}

// Immagine: 'vicelife' / 'discord' / 'ticket' = banner ufficiali (allegati), link, oppure niente
function immagine(embed, scelta) {
  const s = (scelta || '').trim();
  const file = BANNERS[s.toLowerCase()];
  if (file) { embed.setImage(`attachment://${file}`); return [new AttachmentBuilder(path.join(__dirname, file), { name: file })]; }
  if (isUrl(s)) embed.setImage(s);
  return [];
}

function input(id, label, { value, style = TextInputStyle.Short, max = 256, placeholder, required = false } = {}) {
  const t = new TextInputBuilder().setCustomId(id).setLabel(label).setStyle(style).setRequired(required).setMaxLength(max);
  if (value) t.setValue(String(value).slice(0, max));
  if (placeholder) t.setPlaceholder(placeholder);
  return new ActionRowBuilder().addComponents(t);
}

// ================================================
//   /annunci
// ================================================
const inAttesa = new Map(); // utente -> opzioni del comando

const modalAnnuncio = () => new ModalBuilder().setCustomId('anm').setTitle('📢 Nuovo annuncio').addComponents(
  input('titolo', 'Titolo', { placeholder: '📢 AGGIORNAMENTO SERVER' }),
  input('testo', 'Testo (puoi andare a capo)', { style: TextInputStyle.Paragraph, max: 4000, required: true }),
  input('immagine', 'Immagine: vicelife / discord / link / vuoto', { value: 'vicelife', max: 1000 }),
  input('colore', 'Colore (HEX)', { value: ROSA, max: 7 }),
  input('footer', 'Footer (riga in basso)', { value: 'VICE LIFE RP 🌴 • Staff', max: 1024 }),
);

async function inviaAnnuncio(i) {
  const opz = inAttesa.get(i.user.id);
  if (!opz) return i.reply({ content: '⚠️ Tempo scaduto, rifai `/annunci`.', flags: EPH });
  inAttesa.delete(i.user.id);
  const v = (k) => i.fields.getTextInputValue(k).trim();
  const e = new EmbedBuilder().setColor(hex(v('colore'), ROSA)).setDescription(v('testo').slice(0, 4096)).setTimestamp();
  if (v('titolo')) e.setTitle(v('titolo').slice(0, 256));
  if (v('footer')) e.setFooter({ text: v('footer').slice(0, 2048), iconURL: i.guild.iconURL() ?? undefined });
  const files = immagine(e, v('immagine'));
  const ping = [opz.menzione, opz.ruolo ? `<@&${opz.ruolo}>` : ''].filter(Boolean).join(' ');
  const ch = i.guild.channels.cache.get(opz.canale);
  try {
    const msg = await ch.send({
      content: ping || undefined, embeds: [e], files,
      allowedMentions: { parse: opz.menzione ? ['everyone'] : [], roles: opz.ruolo ? [opz.ruolo] : [] },
    });
    return i.reply({ content: `✅ Annuncio pubblicato: ${msg.url}`, flags: EPH });
  } catch (err) {
    return i.reply({ content: `❌ Non posso scrivere in <#${opz.canale}>: ${err.message}`, flags: EPH });
  }
}

// ================================================
//   /link e /link-ds  (pannelli link sempre in chat)
// ================================================
const PANNELLI = {
  ln: {
    chiave: 'link', comando: '/link', nome: '🔗 Pannello Link',
    def: {
      titolo: '🔗 Link ufficiali VICE LIFE RP 🌴',
      descrizione: 'Tutti i nostri link ufficiali in un solo posto 👇\nInvita i tuoi amici e seguici sui social!',
      footer: 'VICE LIFE RP 🌴', colore: ROSA, immagine: 'vicelife', links: [], pubblicato: null,
    },
  },
  ld: {
    chiave: 'linkds', comando: '/link-ds', nome: '💬 Pannello Link Discord',
    def: {
      titolo: '💬 Entra nel Discord di VICE LIFE RP 🌴',
      descrizione: 'Unisciti alla community di **VICE LIFE RP**!\nPremi il pulsante qui sotto per entrare nel nostro Discord 👇',
      footer: 'VICE LIFE RP 🌴', colore: '#3aa0ff', immagine: 'discord', links: [], pubblicato: null,
    },
  },
};
const getPannello = (gid, p) => (cfg(gid)[PANNELLI[p].chiave] ??= structuredClone(PANNELLI[p].def));

function linkEmbed(guild, l) {
  const e = new EmbedBuilder().setColor(l.colore || ROSA).setDescription(l.descrizione || '​');
  if (l.titolo) e.setTitle(l.titolo.slice(0, 256));
  if (l.footer) e.setFooter({ text: l.footer.slice(0, 2048), iconURL: guild.iconURL() ?? undefined });
  if (guild.iconURL()) e.setThumbnail(guild.iconURL({ size: 256 }));
  const files = immagine(e, l.immagine);
  return { e, files };
}

function linkBottoni(l) {
  const rows = [];
  l.links.slice(0, 25).forEach((x, n) => {
    if (n % 5 === 0) rows.push(new ActionRowBuilder());
    const b = new ButtonBuilder().setStyle(ButtonStyle.Link).setURL(x.url).setLabel(x.nome.slice(0, 80));
    if (x.emoji) b.setEmoji(x.emoji);
    rows.at(-1).addComponents(b);
  });
  return rows;
}

function linkPubblico(guild, l) {
  const { e, files } = linkEmbed(guild, l);
  return { embeds: [e], files, attachments: [], components: linkBottoni(l) };
}

async function aggiornaLink(guild, p) {
  const l = getPannello(guild.id, p);
  if (!l.pubblicato) return true;
  try {
    const ch = await guild.channels.fetch(l.pubblicato.canale);
    const msg = await ch.messages.fetch(l.pubblicato.messaggio);
    await msg.edit(linkPubblico(guild, l));
    return true;
  } catch { return false; }
}

function linkPannello(guild, p, avviso = '') {
  const l = getPannello(guild.id, p);
  const elenco = l.links.length ? l.links.map((x) => `${x.emoji || '🔗'} **${x.nome}** → ${x.url}`).join('\n') : '*Nessun link: premi ➕ Aggiungi link*';
  const { e, files } = linkEmbed(guild, l);
  const rows = [];
  if (l.links.length) {
    rows.push(new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(`${p}:modifica`)
      .setPlaceholder('✏️ Modifica un link').addOptions(l.links.map((x) => ({ label: x.nome.slice(0, 100), value: x.id, ...(x.emoji ? { emoji: x.emoji } : {}) })))));
    rows.push(new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(`${p}:elimina`)
      .setPlaceholder('🗑️ Elimina un link').addOptions(l.links.map((x) => ({ label: `Elimina: ${x.nome}`.slice(0, 100), value: x.id })))));
  }
  rows.push(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`${p}:testi`).setLabel('Testi').setEmoji('✏️').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`${p}:stile`).setLabel('Colore & Banner').setEmoji('🎨').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`${p}:aggiungi`).setLabel('Aggiungi link').setEmoji('➕').setStyle(ButtonStyle.Success).setDisabled(l.links.length >= 25),
    ),
    new ActionRowBuilder().addComponents(new ChannelSelectMenuBuilder().setCustomId(`${p}:pubblica`)
      .setPlaceholder('📢 Pubblica il pannello in un canale...').addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)),
  );
  return {
    content: (`## ${PANNELLI[p].nome} – VICE LIFE🌴\n${l.pubblicato ? `📌 Pubblicato in <#${l.pubblicato.canale}> (si aggiorna da solo)` : '📌 *Non ancora pubblicato*'}\n\n**Link:**\n${elenco}\n\n👇 **Anteprima:**` + (avviso ? `\n\n${avviso}` : '')).slice(0, 2000),
    embeds: [e], files, attachments: [], components: rows,
  };
}

const modalLink = (p, x) => new ModalBuilder().setCustomId(x ? `${p}m:link:${x.id}` : `${p}m:link`).setTitle(x ? '✏️ Modifica link' : '➕ Nuovo link').addComponents(
  input('nome', 'Nome del pulsante (es. Entra nel Discord)', { value: x?.nome ?? (p === 'ld' ? 'Entra nel Discord' : ''), max: 80, required: true }),
  input('url', 'Link (deve iniziare con https://)', { value: x?.url, max: 512, required: true, placeholder: 'https://discord.gg/...' }),
  input('emoji', 'Emoji (facoltativa)', { value: x?.emoji ?? (p === 'ld' ? '💬' : ''), max: 64, placeholder: '💬 📸 🎵 ▶️' }),
);
const modalLinkTesti = (p, l) => new ModalBuilder().setCustomId(`${p}m:testi`).setTitle('✏️ Testi pannello').addComponents(
  input('titolo', 'Titolo', { value: l.titolo }),
  input('descrizione', 'Descrizione (puoi andare a capo)', { value: l.descrizione, style: TextInputStyle.Paragraph, max: 4000 }),
  input('footer', 'Footer', { value: l.footer, max: 1024 }),
);
const modalLinkStile = (p, l) => new ModalBuilder().setCustomId(`${p}m:stile`).setTitle('🎨 Colore & Banner').addComponents(
  input('colore', 'Colore (HEX)', { value: l.colore, max: 7 }),
  input('immagine', 'Banner: discord / vicelife / link / vuoto', { value: l.immagine, max: 1000 }),
);

async function gestisciLink(i) {
  const g = i.guild;
  const [a, b, id] = i.customId.split(':');
  const p = a.slice(0, 2); // 'ln' oppure 'ld'
  const l = getPannello(g.id, p);
  const fatto = async (avviso) => {
    save();
    const ok = await aggiornaLink(g, p);
    return i.update(linkPannello(g, p, ok ? avviso : `${avviso}\n⚠️ Non trovo più il pannello pubblicato: ripubblicalo.`));
  };
  if (a === p) {
    if (b === 'testi') return i.showModal(modalLinkTesti(p, l));
    if (b === 'stile') return i.showModal(modalLinkStile(p, l));
    if (b === 'aggiungi') return i.showModal(modalLink(p, null));
    if (b === 'modifica') { const x = l.links.find((y) => y.id === i.values[0]); return x ? i.showModal(modalLink(p, x)) : i.update(linkPannello(g, p)); }
    if (b === 'elimina') { l.links = l.links.filter((y) => y.id !== i.values[0]); return fatto('🗑️ Link eliminato.'); }
    if (b === 'pubblica') {
      const ch = g.channels.cache.get(i.values[0]);
      if (!l.links.length) return i.update(linkPannello(g, p, '⚠️ Aggiungi almeno un link prima di pubblicare (➕ Aggiungi link).'));
      try {
        const msg = await ch.send(linkPubblico(g, l));
        if (l.pubblicato) {
          const old = await g.channels.fetch(l.pubblicato.canale).catch(() => null);
          await old?.messages.delete(l.pubblicato.messaggio).catch(() => {});
        }
        l.pubblicato = { canale: ch.id, messaggio: msg.id };
        save();
        return i.update(linkPannello(g, p, `✅ Pannello pubblicato in <#${ch.id}>! Resta lì e si aggiorna da solo.`));
      } catch (e) { return i.update(linkPannello(g, p, `❌ Non posso scrivere in <#${ch.id}>: ${e.message}`)); }
    }
  }
  if (a === `${p}m`) {
    const v = (k) => i.fields.getTextInputValue(k).trim();
    if (b === 'testi') { Object.assign(l, { titolo: v('titolo'), descrizione: v('descrizione'), footer: v('footer') }); return fatto('✅ Testi aggiornati.'); }
    if (b === 'stile') {
      l.colore = hex(v('colore'), l.colore);
      const img = v('immagine');
      if (!img || isUrl(img) || BANNERS[img.toLowerCase()]) l.immagine = BANNERS[img.toLowerCase()] ? img.toLowerCase() : img;
      return fatto('✅ Stile aggiornato.');
    }
    if (b === 'link') {
      const url = v('url'); const emoji = v('emoji');
      if (!isUrl(url)) return i.update(linkPannello(g, p, '❌ Link non valido: deve iniziare con https://'));
      const dati = { nome: v('nome'), url, emoji: emoji && isEmoji(emoji) ? emoji : '' };
      const avvisoEmoji = emoji && !dati.emoji ? ' (emoji non valida, tolta)' : '';
      if (id) Object.assign(l.links.find((y) => y.id === id) ?? {}, dati);
      else l.links.push({ id: nuovoId(), ...dati });
      return fatto(`✅ Link **${dati.nome}** salvato${avvisoEmoji}.`);
    }
  }
}

// ================================================
//   /sondaggi  (1 voto per player)
// ================================================
const sondaggi = (gid) => (cfg(gid).sondaggi ??= {});
const NUMERI = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];

const modalSondaggio = () => new ModalBuilder().setCustomId('sdm').setTitle('📊 Nuovo sondaggio').addComponents(
  input('domanda', 'Domanda', { max: 256, required: true, placeholder: 'Che evento volete questo weekend?' }),
  input('opzioni', 'Risposte: una per riga (da 2 a 10)', { style: TextInputStyle.Paragraph, max: 1000, required: true, placeholder: 'Gara di auto\nRapina alla banca\nFesta in spiaggia' }),
  input('durata', 'Durata (es. 1g, 12h) - vuoto = senza fine', { max: 30, placeholder: '1g 12h' }),
  input('descrizione', 'Descrizione (facoltativa)', { style: TextInputStyle.Paragraph, max: 1000 }),
);

function sondaggioMessaggio(s) {
  const voti = Object.values(s.voti);
  const tot = voti.length;
  const conti = s.opzioni.map((_, n) => voti.filter((v) => v === n).length);
  const max = Math.max(...conti);
  const righe = s.opzioni.map((o, n) => {
    const p = tot ? Math.round((conti[n] / tot) * 100) : 0;
    const barra = '▰'.repeat(Math.round(p / 10)) + '▱'.repeat(10 - Math.round(p / 10));
    const top = s.chiuso && tot && conti[n] === max ? ' 🏆' : '';
    return `${NUMERI[n]} **${o}**${top}\n${barra} **${p}%** (${conti[n]} ${conti[n] === 1 ? 'voto' : 'voti'})`;
  });
  const stato = s.chiuso ? '🏁 **Sondaggio chiuso**' : s.fine ? `⏰ Termina <t:${ts(s.fine)}:R>` : '🟢 Sondaggio aperto';
  const e = new EmbedBuilder().setColor(s.chiuso ? '#777777' : ROSA).setTitle(`📊 ${s.domanda}`.slice(0, 256))
    .setDescription(`${s.descrizione ? `${s.descrizione}\n\n` : ''}${righe.join('\n\n')}\n\n${stato}`.slice(0, 4096))
    .setFooter({ text: `${tot} ${tot === 1 ? 'voto' : 'voti'} • 1 voto per player • Puoi cambiare idea • Voto anonimo` });
  const rows = [];
  if (!s.chiuso) {
    s.opzioni.forEach((o, n) => {
      if (n % 5 === 0) rows.push(new ActionRowBuilder());
      rows.at(-1).addComponents(new ButtonBuilder().setCustomId(`sd:${s.id}:${n}`).setEmoji(NUMERI[n])
        .setLabel(o.slice(0, 70)).setStyle(ButtonStyle.Secondary));
    });
    rows.push(new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`sd:${s.id}:chiudi`).setLabel('Chiudi sondaggio (staff)').setEmoji('🔒').setStyle(ButtonStyle.Danger),
    ));
  }
  return { embeds: [e], components: rows };
}

async function creaSondaggio(i) {
  const canale = inAttesa.get(`sd:${i.user.id}`);
  inAttesa.delete(`sd:${i.user.id}`);
  const v = (k) => i.fields.getTextInputValue(k).trim();
  const opzioni = v('opzioni').split('\n').map((x) => x.trim()).filter(Boolean).slice(0, 10);
  if (opzioni.length < 2) return i.reply({ content: '❌ Servono almeno 2 risposte (una per riga).', flags: EPH });
  const ms = durata(v('durata'));
  if (v('durata') && !ms) return i.reply({ content: '❌ Durata non valida. Esempi: `1g`, `12h`, `30m`, `1g 6h`.', flags: EPH });
  const s = { id: nuovoId(), domanda: v('domanda'), descrizione: v('descrizione'), opzioni, voti: {}, fine: ms ? Date.now() + ms : null, chiuso: false };
  const ch = i.guild.channels.cache.get(canale) ?? i.channel;
  try {
    const msg = await ch.send(sondaggioMessaggio(s));
    Object.assign(s, { canale: ch.id, messaggio: msg.id });
    sondaggi(i.guild.id)[s.id] = s;
    save();
    return i.reply({ content: `✅ Sondaggio pubblicato: ${msg.url}`, flags: EPH });
  } catch (e) { return i.reply({ content: `❌ Non posso scrivere in <#${ch.id}>: ${e.message}`, flags: EPH }); }
}

async function chiudiSondaggio(guild, s) {
  s.chiuso = true;
  save();
  const ch = await guild.channels.fetch(s.canale).catch(() => null);
  const msg = await ch?.messages.fetch(s.messaggio).catch(() => null);
  await msg?.edit(sondaggioMessaggio(s)).catch(() => {});
}

async function votaSondaggio(i) {
  const [, id, scelta] = i.customId.split(':');
  const s = sondaggi(i.guild.id)[id];
  if (!s || s.chiuso) return i.reply({ content: '🔒 Questo sondaggio è chiuso.', flags: EPH });
  if (scelta === 'chiudi') {
    if (!staff(i)) return i.reply({ content: '❌ Solo lo staff può chiudere il sondaggio.', flags: EPH });
    s.chiuso = true; save();
    return i.update(sondaggioMessaggio(s));
  }
  // 1 voto per player, ma si può cambiare idea (o togliere il voto premendo di nuovo la stessa risposta)
  const prima = s.voti[i.user.id];
  const n = Number(scelta);
  let msg;
  if (prima === n) { delete s.voti[i.user.id]; msg = `↩️ Hai tolto il tuo voto (**${s.opzioni[n]}**).`; }
  else if (prima !== undefined) { s.voti[i.user.id] = n; msg = `🔄 Hai cambiato idea: da **${s.opzioni[prima]}** a **${s.opzioni[n]}**.`; }
  else { s.voti[i.user.id] = n; msg = `✅ Hai votato: **${s.opzioni[n]}**. Puoi cambiare idea quando vuoi.`; }
  save();
  await i.update(sondaggioMessaggio(s));
  return i.followUp({ content: msg, flags: EPH });
}

// ================================================
//   /giveaway  (1 vincitore)
// ================================================
const giveaways = (gid) => (cfg(gid).giveaway ??= {});

const modalGiveaway = () => new ModalBuilder().setCustomId('gwm').setTitle('🎁 Nuovo giveaway').addComponents(
  input('premio', 'Cosa si vince?', { max: 200, required: true, placeholder: 'Auto sportiva in gioco + 50.000$' }),
  input('durata', 'Quando scade? (es. 1g, 12h, 30m, 2g 6h)', { max: 30, required: true, placeholder: '1g' }),
  input('descrizione', 'Descrizione / regole (facoltativa)', { style: TextInputStyle.Paragraph, max: 2000 }),
  input('immagine', 'Immagine: vicelife / discord / link / vuoto', { value: 'vicelife', max: 1000 }),
);

function giveawayMessaggio(guild, gw) {
  const n = gw.partecipanti.length;
  const e = new EmbedBuilder().setColor(gw.finito ? '#777777' : ROSA).setTitle(`🎁 GIVEAWAY: ${gw.premio}`.slice(0, 256)).setTimestamp(gw.fine);
  let testo = gw.descrizione ? `${gw.descrizione}\n\n` : '';
  if (gw.finito) {
    testo += gw.vincitore ? `🏆 **Vincitore:** <@${gw.vincitore}>\n` : '😢 **Nessun partecipante**, nessun vincitore.\n';
    testo += `👥 Partecipanti: **${n}**\n🏁 Terminato <t:${ts(gw.fine)}:R>`;
  } else {
    testo += `🏆 **1 vincitore** estratto a caso\n⏰ Termina <t:${ts(gw.fine)}:R> (<t:${ts(gw.fine)}:f>)\n👤 Organizzato da <@${gw.host}>\n\nPremi **🎉 Partecipa** per entrare!`;
  }
  e.setDescription(testo.slice(0, 4096)).setFooter({ text: gw.finito ? 'Giveaway terminato' : 'Termina' });
  const files = immagine(e, gw.immagine);
  const riga = new ActionRowBuilder();
  if (!gw.finito) {
    riga.addComponents(
      new ButtonBuilder().setCustomId(`gw:${gw.id}:entra`).setLabel(`Partecipa (${n})`).setEmoji('🎉').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`gw:${gw.id}:fine`).setLabel('Termina ora (staff)').setEmoji('⏹️').setStyle(ButtonStyle.Secondary),
    );
  } else {
    riga.addComponents(new ButtonBuilder().setCustomId(`gw:${gw.id}:riestrai`).setLabel('Riestrai (staff)').setEmoji('🔄').setStyle(ButtonStyle.Secondary));
  }
  return { embeds: [e], files, attachments: [], components: [riga] };
}

async function creaGiveaway(i) {
  const canale = inAttesa.get(`gw:${i.user.id}`);
  inAttesa.delete(`gw:${i.user.id}`);
  const v = (k) => i.fields.getTextInputValue(k).trim();
  const ms = durata(v('durata'));
  if (!ms) return i.reply({ content: '❌ Durata non valida. Esempi: `1g`, `12h`, `30m`, `2g 6h`.', flags: EPH });
  const gw = {
    id: nuovoId(), premio: v('premio'), descrizione: v('descrizione'), immagine: v('immagine'),
    fine: Date.now() + ms, host: i.user.id, partecipanti: [], finito: false, vincitore: null,
  };
  const ch = i.guild.channels.cache.get(canale) ?? i.channel;
  try {
    const msg = await ch.send(giveawayMessaggio(i.guild, gw));
    Object.assign(gw, { canale: ch.id, messaggio: msg.id });
    giveaways(i.guild.id)[gw.id] = gw;
    save();
    return i.reply({ content: `✅ Giveaway pubblicato: ${msg.url}`, flags: EPH });
  } catch (e) { return i.reply({ content: `❌ Non posso scrivere in <#${ch.id}>: ${e.message}`, flags: EPH }); }
}

async function estrai(guild, gw, escludi = []) {
  const pool = gw.partecipanti.filter((u) => !escludi.includes(u));
  let vincitore = null;
  while (pool.length && !vincitore) {
    const u = pool.splice(Math.floor(Math.random() * pool.length), 1)[0];
    if (await guild.members.fetch(u).catch(() => null)) vincitore = u; // deve essere ancora nel server
  }
  gw.vincitore = vincitore;
  gw.finito = true;
  save();
  const ch = await guild.channels.fetch(gw.canale).catch(() => null);
  const msg = await ch?.messages.fetch(gw.messaggio).catch(() => null);
  await msg?.edit(giveawayMessaggio(guild, gw)).catch(() => {});
  if (ch) {
    await ch.send(vincitore
      ? { content: `🎉 Congratulazioni <@${vincitore}>! Hai vinto **${gw.premio}**! Apri un ticket per ritirare il premio.`, allowedMentions: { users: [vincitore] } }
      : { content: `😢 Il giveaway **${gw.premio}** è terminato senza partecipanti.` }).catch(() => {});
  }
}

async function bottoneGiveaway(i) {
  const [, id, azione] = i.customId.split(':');
  const gw = giveaways(i.guild.id)[id];
  if (!gw) return i.reply({ content: '❌ Giveaway non trovato.', flags: EPH });
  if (azione === 'entra') {
    if (gw.finito) return i.reply({ content: '🏁 Questo giveaway è terminato.', flags: EPH });
    const dentro = gw.partecipanti.includes(i.user.id);
    gw.partecipanti = dentro ? gw.partecipanti.filter((u) => u !== i.user.id) : [...gw.partecipanti, i.user.id];
    save();
    const m = giveawayMessaggio(i.guild, gw);
    await i.update({ components: m.components }); // cambia solo il contatore
    return i.followUp({ content: dentro ? '👋 Sei uscito dal giveaway.' : '🎉 Partecipi al giveaway! Premi di nuovo il pulsante per uscire.', flags: EPH });
  }
  if (!staff(i)) return i.reply({ content: '❌ Solo lo staff può farlo.', flags: EPH });
  await i.deferUpdate();
  if (azione === 'fine' && !gw.finito) { gw.fine = Date.now(); return estrai(i.guild, gw); }
  if (azione === 'riestrai' && gw.finito) return estrai(i.guild, gw, gw.vincitore ? [gw.vincitore] : []);
}

// ================================================
//   /spoiler  (immagini censurate: si preme sopra per vederle)
// ================================================
const EMOJI_SPOILER = '1575192806618570885';
const modalSpoiler = () => new ModalBuilder().setCustomId('spm').setTitle('🙈 Spoiler').addComponents(
  input('titolo', 'Titolo', { max: 200, placeholder: '🙈 SPOILER: nuova macchina in arrivo' }),
  input('descrizione', 'Descrizione (puoi andare a capo)', { style: TextInputStyle.Paragraph, max: 1700, placeholder: 'Premi sull\'immagine per scoprirla 👇' }),
);

async function inviaSpoiler(i) {
  const opz = inAttesa.get(`sp:${i.user.id}`);
  if (!opz) return i.reply({ content: '⚠️ Tempo scaduto, rifai `/spoiler`.', flags: EPH });
  inAttesa.delete(`sp:${i.user.id}`);
  await i.deferReply({ flags: EPH });
  const v = (k) => i.fields.getTextInputValue(k).trim();
  const ping = [opz.menzione, opz.ruolo ? `<@&${opz.ruolo}>` : ''].filter(Boolean).join(' ');
  // Emoji fissa + obiettivo interazioni, sempre in fondo allo spoiler
  const emoji = i.guild.emojis.cache.get(EMOJI_SPOILER) ?? await i.guild.emojis.fetch(EMOJI_SPOILER).catch(() => null);
  const fondo = `${emoji ? `${emoji}\n` : ''}**Arriviamo a ${opz.obiettivo} interazioni per il prossimo spoiler!**`;
  const testo = [v('titolo') ? `## ${v('titolo')}` : '', v('descrizione'), ping, `\n${fondo}`].filter(Boolean).join('\n').slice(0, 2000);
  // Il prefisso SPOILER_ fa apparire l'immagine sfocata finché non ci premi sopra
  const files = opz.immagini.map((a, n) => new AttachmentBuilder(a.url, { name: `SPOILER_${n + 1}_${a.name}`.slice(0, 100) }).setSpoiler(true));
  const ch = i.guild.channels.cache.get(opz.canale);
  try {
    const msg = await ch.send({
      content: testo || undefined, files,
      allowedMentions: { parse: opz.menzione ? ['everyone'] : [], roles: opz.ruolo ? [opz.ruolo] : [] },
    });
    // Salva lo spoiler per controllare quando arriva all'obiettivo di interazioni
    (cfg(i.guild.id).spoiler ??= {})[msg.id] = { canale: ch.id, obiettivo: opz.obiettivo, raggiunto: false, titolo: v('titolo') };
    save();
    // Reazioni automatiche del bot, così i player ci cliccano sopra
    await msg.react('✅').catch(() => {});
    if (emoji) await msg.react(emoji).catch(() => {});
    return i.editReply(`✅ Spoiler pubblicato: ${msg.url}`);
  } catch (err) {
    return i.editReply(`❌ Non riesco a pubblicare lo spoiler in <#${opz.canale}>: ${err.message}`);
  }
}

// Quando uno spoiler arriva all'obiettivo di interazioni -> annuncio automatico
async function onReaction(reaction, user) {
  if (user.bot || !reaction.message.guildId) return;
  const sp = cfg(reaction.message.guildId).spoiler?.[reaction.message.id];
  if (!sp || sp.raggiunto) return;
  try {
    if (reaction.partial) await reaction.fetch();
    const msg = reaction.message.partial ? await reaction.message.fetch() : reaction.message;
    // Conta le persone diverse che hanno reagito (bot esclusi)
    const persone = new Set();
    for (const r of msg.reactions.cache.values()) {
      (await r.users.fetch()).forEach((u) => { if (!u.bot) persone.add(u.id); });
    }
    if (persone.size < sp.obiettivo || sp.raggiunto) return;
    sp.raggiunto = true;
    save();
    const e = new EmbedBuilder().setColor(ROSA).setTitle('🎉 OBIETTIVO RAGGIUNTO!')
      .setDescription(`Siamo arrivati a **${persone.size} interazioni** su questo spoiler! 🔥\n\n🙈 **A breve il prossimo spoiler...**\nRestate sintonizzati! 🌴`)
      .setFooter({ text: 'VICE LIFE RP 🌴' }).setTimestamp();
    const files = immagine(e, 'vicelife');
    await msg.reply({ embeds: [e], files, allowedMentions: { repliedUser: false } });
    console.log(`🙈 Spoiler ${msg.id}: obiettivo di ${sp.obiettivo} interazioni raggiunto`);
  } catch (e) { console.warn(`[spoiler] ${e.message}`); }
}

// ---------- controllo scadenze (ogni 20 secondi) ----------
let inCorso = false;
async function controllaScadenze(client) {
  if (inCorso) return;
  inCorso = true;
  try {
    for (const guild of client.guilds.cache.values()) {
      for (const s of Object.values(cfg(guild.id).sondaggi ?? {})) if (!s.chiuso && s.fine && s.fine <= Date.now()) await chiudiSondaggio(guild, s);
      for (const gw of Object.values(cfg(guild.id).giveaway ?? {})) if (!gw.finito && gw.fine <= Date.now()) await estrai(guild, gw);
    }
  } catch (e) { console.warn(`[scadenze] ${e.message}`); }
  inCorso = false;
}

// ================================================
//   comandi
// ================================================
const conCanale = (b, descr) => b.addChannelOption((o) => o.setName('canale').setDescription(descr)
  .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement).setRequired(true))
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild).setDMPermission(false);

const commands = [
  conCanale(new SlashCommandBuilder().setName('annunci').setDescription('Pubblica un annuncio personalizzato con il banner'), 'Dove pubblicare l\'annuncio')
    .addStringOption((o) => o.setName('menzione').setDescription('Chi taggare').addChoices(
      { name: 'Nessuno', value: 'nessuno' }, { name: '@everyone', value: '@everyone' }, { name: '@here', value: '@here' }))
    .addRoleOption((o) => o.setName('ruolo').setDescription('Tagga anche un ruolo (facoltativo)')),
  new SlashCommandBuilder().setName('link').setDescription('Apri il pannello per creare i link del server e dei social')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild).setDMPermission(false),
  new SlashCommandBuilder().setName('link-ds').setDescription('Apri il pannello del link di invito Discord con il banner')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild).setDMPermission(false),
  conCanale(new SlashCommandBuilder().setName('sondaggi').setDescription('Crea un sondaggio (1 voto per player)'), 'Dove pubblicare il sondaggio'),
  conCanale(new SlashCommandBuilder().setName('giveaway').setDescription('Crea un giveaway con 1 vincitore'), 'Dove pubblicare il giveaway'),
  conCanale(new SlashCommandBuilder().setName('spoiler').setDescription('Pubblica immagini censurate: si preme sopra per vederle'), 'Dove pubblicare lo spoiler')
    .addAttachmentOption((o) => o.setName('immagine').setDescription('L\'immagine da censurare').setRequired(true))
    .addAttachmentOption((o) => o.setName('immagine2').setDescription('Seconda immagine (facoltativa)'))
    .addAttachmentOption((o) => o.setName('immagine3').setDescription('Terza immagine (facoltativa)'))
    .addStringOption((o) => o.setName('menzione').setDescription('Chi taggare').addChoices(
      { name: 'Nessuno', value: 'nessuno' }, { name: '@everyone', value: '@everyone' }, { name: '@here', value: '@here' }))
    .addRoleOption((o) => o.setName('ruolo').setDescription('Tagga anche un ruolo (facoltativo)'))
    .addIntegerOption((o) => o.setName('obiettivo').setDescription('Quante interazioni servono per il prossimo spoiler (default 10)').setMinValue(1).setMaxValue(10000)),
].map((c) => c.toJSON());

const NOMI = ['annunci', 'link', 'link-ds', 'sondaggi', 'giveaway', 'spoiler'];

async function handle(i) {
  if (i.isChatInputCommand()) {
    const canale = i.options.getChannel('canale')?.id;
    if (i.commandName === 'annunci') {
      const m = i.options.getString('menzione');
      inAttesa.set(i.user.id, { canale, menzione: m && m !== 'nessuno' ? m : '', ruolo: i.options.getRole('ruolo')?.id });
      return i.showModal(modalAnnuncio());
    }
    if (i.commandName === 'link') return i.reply({ ...linkPannello(i.guild, 'ln'), flags: EPH });
    if (i.commandName === 'link-ds') return i.reply({ ...linkPannello(i.guild, 'ld'), flags: EPH });
    if (i.commandName === 'sondaggi') { inAttesa.set(`sd:${i.user.id}`, canale); return i.showModal(modalSondaggio()); }
    if (i.commandName === 'spoiler') {
      const immagini = ['immagine', 'immagine2', 'immagine3'].map((k) => i.options.getAttachment(k)).filter(Boolean);
      if (immagini.some((a) => !a.contentType?.startsWith('image/') && !a.contentType?.startsWith('video/'))) {
        return i.reply({ content: '❌ Puoi caricare solo immagini o video.', flags: EPH });
      }
      const m = i.options.getString('menzione');
      inAttesa.set(`sp:${i.user.id}`, {
        canale, immagini: immagini.map((a) => ({ url: a.url, name: a.name })),
        menzione: m && m !== 'nessuno' ? m : '', ruolo: i.options.getRole('ruolo')?.id,
        obiettivo: i.options.getInteger('obiettivo') ?? 10,
      });
      return i.showModal(modalSpoiler());
    }
    if (i.commandName === 'giveaway') { inAttesa.set(`gw:${i.user.id}`, canale); return i.showModal(modalGiveaway()); }
  }
  const id = i.customId;
  if (id === 'anm') return inviaAnnuncio(i);
  if (id === 'sdm') return creaSondaggio(i);
  if (id === 'gwm') return creaGiveaway(i);
  if (id === 'spm') return inviaSpoiler(i);
  if (id.startsWith('sd:')) return votaSondaggio(i);
  if (id.startsWith('gw:')) return bottoneGiveaway(i);
  if (/^(ln|ld)m?:/.test(id)) {
    if (!staff(i)) return i.reply({ content: '❌ Non hai i permessi.', flags: EPH });
    return gestisciLink(i);
  }
}

module.exports = {
  init(cfgFn, saveFn) { cfg = cfgFn; save = saveFn; },
  commands,
  isCommunity: (i) => (i.isChatInputCommand() && NOMI.includes(i.commandName))
    || /^(anm|sdm|gwm|spm|sd:|gw:|lnm?:|ldm?:)/.test(i.customId ?? ''),
  handle,
  avviaTimer(client) {
    setInterval(() => controllaScadenze(client), 20 * 1000);
    controllaScadenze(client);
  },
  onReaction,
  onReady: async (guild) => { await aggiornaLink(guild, 'ln'); await aggiornaLink(guild, 'ld'); },
  // per i test
  _durata: durata, _sondaggioMessaggio: sondaggioMessaggio, _giveawayMessaggio: giveawayMessaggio, _linkPannello: linkPannello,
  _modals: () => [modalSpoiler(), modalAnnuncio(), modalSondaggio(), modalGiveaway(), modalLink('ln', null), modalLink('ld', null), modalLinkTesti('ld', PANNELLI.ld.def), modalLinkStile('ld', PANNELLI.ld.def)],
};
