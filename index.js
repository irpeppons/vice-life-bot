// ================================================
//   VICE LIFE🌴  -  Bot Discord per server RP
//   /lista          -> crea la categoria statistiche (stile ServerStats)
//   /rimuovi-lista  -> elimina la categoria statistiche
//   /benvenuto      -> apre il PANNELLO per creare il benvenuto personalizzato
//   /ticket         -> apre il PANNELLO per creare il sistema ticket
//   /autoruoli      -> sceglie i ruoli dati in automatico a chi entra
//   /idfissi, /id   -> numero fisso nel nickname in base all'ordine di ingresso
//   /annunci, /link, /link-ds, /sondaggi, /giveaway, /spoiler
//   /stato-server   -> online / offline / manutenzione
//   /wl-info        -> info per la whitelist conoscitiva (pubblicate da sole nel canale WL)
//   /richiesta-wl   -> pannello richieste whitelist (canale privato con lo staff)
//   /esito-wl       -> WL passata / non superata (solo esaminatori)
//   /storie-pg      -> storie dei personaggi (accettate dagli esaminatori)
//   Audio sala d'attesa -> chi entra nel vocale d'attesa sente un messaggio (solo lui)
// ================================================
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const {
  Client, GatewayIntentBits, Partials, ChannelType, PermissionFlagsBits, MessageFlags,
  EmbedBuilder, SlashCommandBuilder, ActivityType,
  ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelSelectMenuBuilder,
  ModalBuilder, TextInputBuilder, TextInputStyle, StringSelectMenuBuilder, AttachmentBuilder, RoleSelectMenuBuilder,
  GuildSystemChannelFlags, SystemChannelFlagsBitField,
} = require('discord.js');
const { DEFAULT_CARD, renderCard, saveBackground, lib: loadCanvas } = require('./card');

const BOT_NAME = 'VICE LIFE🌴';
const DATA_FILE = path.join(__dirname, 'data.json');
const UPDATE_EVERY_MS = 10 * 60 * 1000; // Discord permette 2 rinomine canale ogni 10 minuti
const EPHEMERAL = MessageFlags.Ephemeral;

// ---------- salvataggio configurazione ----------
let data = {};
try { data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); } catch { data = {}; }
const save = () => fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
const cfg = (guildId) => (data[guildId] ??= { stats: null, welcome: null });
const tickets = require('./tickets');
tickets.init(cfg, save);
const idfissi = require('./idfissi');
idfissi.init(cfg, save);
const memoria = require('./memoria');
memoria.init(cfg, save);
const community = require('./community');
community.init(cfg, save);
const statoServer = require('./stato');
statoServer.init(cfg, save);
const wl = require('./wl');
wl.init(cfg, save);
const richiestaWl = require('./richiestawl');
richiestaWl.init(cfg, save);
const esitoWl = require('./esitowl');
esitoWl.init(cfg, save);
const storie = require('./storie');
storie.init(cfg, save);
const voce = require('./voce');
voce.init(cfg, save);

// ---------- statistiche ----------
const STATS = [
  { key: 'membri', label: '👥 Membri', get: (g) => g.memberCount },
  { key: 'umani',  label: '👤 Cittadini', get: (g) => g.members.cache.filter((m) => !m.user.bot).size },
  { key: 'bot',    label: '🤖 Bot', get: (g) => g.members.cache.filter((m) => m.user.bot).size },
  { key: 'boost',  label: '🚀 Boost', get: (g) => g.premiumSubscriptionCount ?? 0 },
];
const statName = (s, g) => `${s.label}: ${s.get(g)}`;

async function updateStats(guild) {
  const c = cfg(guild.id).stats;
  if (!c) return;
  for (const s of STATS) {
    const ch = guild.channels.cache.get(c.channels[s.key]);
    if (!ch) continue;
    const name = statName(s, guild);
    if (ch.name !== name) await ch.setName(name).catch((e) => console.warn(`[stats] ${guild.name}: ${e.message}`));
  }
}

// Aggiornamento "a scaglioni": al massimo uno ogni 10 minuti per server
const pending = new Map();
function scheduleStats(guild) {
  if (pending.has(guild.id)) return;
  const last = cfg(guild.id).stats?.lastUpdate ?? 0;
  const wait = Math.max(0, UPDATE_EVERY_MS - (Date.now() - last));
  pending.set(guild.id, setTimeout(async () => {
    pending.delete(guild.id);
    if (!cfg(guild.id).stats) return;
    cfg(guild.id).stats.lastUpdate = Date.now();
    save();
    await updateStats(guild);
  }, wait));
}

// ================================================
//   BENVENUTO PERSONALIZZATO (con pannello + immagine con banner)
// ================================================
const DEFAULT_WELCOME = {
  attivo: false,
  canale: null,
  riquadro: true, // embed sì/no
  sopra: '{user}',
  autore: '',
  titolo: 'Benvenuto/a a VICE LIFE🌴',
  descrizione: 'Ciao {user}! 🌴\nBenvenuto/a a **{server}**!\nSei il cittadino n° **{membri}**.\n\nLeggi il regolamento e buon RP!',
  footer: 'VICE LIFE🌴 • Membro n° {membri}',
  colore: '#ff2d95',
  immagine: '',
  miniatura: 'avatar',
  card: { ...DEFAULT_CARD },
};
const LAYOUTS = {
  'profilo-cerchio': '🖼️ Banner sopra, nome sotto (tondo)',
  'profilo-quadrato': '🖼️ Banner sopra, nome sotto (quadrato)',
  'centro-cerchio': '🟣 Avatar al centro (tondo)',
  'centro-quadrato': '🟪 Avatar al centro (quadrato)',
  'sinistra-cerchio': '⬅️ Avatar a sinistra (tondo)',
  'sinistra-quadrato': '◀️ Avatar a sinistra (quadrato)',
};

// Restituisce la config del benvenuto (convertendo quella vecchia se serve)
function getWelcome(guildId) {
  const c = cfg(guildId);
  if (!c.welcome) c.welcome = { ...DEFAULT_WELCOME };
  const w = c.welcome;
  if (w.messaggio !== undefined && w.descrizione === undefined) { // vecchio formato
    c.welcome = { ...DEFAULT_WELCOME, attivo: true, canale: w.canale, descrizione: w.messaggio,
      titolo: w.titolo || DEFAULT_WELCOME.titolo, colore: w.colore || DEFAULT_WELCOME.colore, immagine: w.immagine || '' };
    save();
  }
  if ((c.welcome.cardVer ?? 1) < 2) { // nuova immagine: banner VICE LIFE sopra, nome e cittadino sotto
    c.welcome.card = { ...(c.welcome.card || {}), sfondo: 'vicelife', layout: 'profilo', forma: 'cerchio', oscuramento: 0,
      riga1: '{username}', riga2: 'Sei il cittadino n° {membri}', riga3: '', attiva: true };
    c.welcome.cardVer = 2;
    save();
  }
  return { ...DEFAULT_WELCOME, ...c.welcome, card: { ...DEFAULT_CARD, ...(c.welcome.card || {}) } };
}
function setWelcome(guildId, changes) {
  cfg(guildId).welcome = { ...getWelcome(guildId), ...changes };
  save();
  return cfg(guildId).welcome;
}
const setCard = (guildId, changes) => setWelcome(guildId, { card: { ...getWelcome(guildId).card, ...changes } });

function fill(text, member, plain = false) {
  return (text || '')
    .replace(/\\n/g, '\n')
    .replace(/{user}/g, plain ? member.user.username : `<@${member.id}>`)
    .replace(/{username}/g, member.user.username)
    .replace(/{server}/g, member.guild.name)
    .replace(/{membri}/g, String(cittadini(member.guild)))
    .replace(/{id}/g, idfissi.idText(member));
}
const isUrl = (s) => /^https?:\/\/\S+$/i.test(s);
// Numero di cittadini: conta le persone (anche il proprietario), NON i bot
const cittadini = (guild) => guild.members.cache.filter((m) => !m.user.bot).size || guild.memberCount;
const hex = (s) => { if (!s) return null; const h = s.startsWith('#') ? s : `#${s}`; return /^#[0-9a-f]{6}$/i.test(h) ? h : undefined; };

function welcomeEmbed(member, w, conCard) {
  const e = new EmbedBuilder().setColor(w.colore || DEFAULT_WELCOME.colore);
  if (w.autore) e.setAuthor({ name: fill(w.autore, member).slice(0, 256), iconURL: member.guild.iconURL() ?? undefined });
  if (w.titolo) e.setTitle(fill(w.titolo, member).slice(0, 256));
  e.setDescription(fill(w.descrizione, member).slice(0, 4096) || '​');
  if (w.miniatura === 'avatar') e.setThumbnail(member.user.displayAvatarURL({ size: 256 }));
  else if (w.miniatura === 'server' && member.guild.iconURL()) e.setThumbnail(member.guild.iconURL({ size: 256 }));
  else if (isUrl(w.miniatura)) e.setThumbnail(w.miniatura);
  if (conCard) e.setImage('attachment://benvenuto.png');
  else if (isUrl(w.immagine)) e.setImage(w.immagine);
  if (w.footer) e.setFooter({ text: fill(w.footer, member).slice(0, 2048) }).setTimestamp();
  return e;
}

async function welcomeMessage(member, w) {
  const files = [];
  if (w.card.attiva) {
    try {
      const png = await renderCard(w.card, {
        guildId: member.guild.id,
        avatarURL: member.user.displayAvatarURL({ extension: 'png', size: 256, forceStatic: true }),
        testi: [w.card.riga1, w.card.riga2, w.card.riga3].map((t) => fill(t, member, true).replace(/\n/g, ' ')),
      });
      files.push(new AttachmentBuilder(png, { name: 'benvenuto.png' }));
    } catch (e) { console.warn(`[card] ${e.message}`); }
  }
  const content = fill(w.sopra, member).slice(0, 2000) || undefined;
  const riquadro = w.riquadro || !files.length; // senza immagine il riquadro serve per forza
  return { content, embeds: riquadro ? [welcomeEmbed(member, w, files.length > 0)] : [], files };
}

async function sendWelcome(member, force = false) {
  const w = getWelcome(member.guild.id);
  if ((!w.attivo && !force) || !w.canale) return false;
  const ch = member.guild.channels.cache.get(w.canale);
  if (!ch?.isTextBased()) return false;
  await ch.send(await welcomeMessage(member, w));
  return true;
}

// ---------- il pannello ----------
async function panel(member, warning = '') {
  const w = getWelcome(member.guild.id);
  const on = (b) => (b ? '🟢' : '🔴');
  const sfondo = { file: 'immagine caricata', vicelife: 'banner VICE LIFE', '': 'sfumatura colorata' }[w.card.sfondo] ?? 'link';
  const header =
    `## 🌴 Pannello Benvenuto – ${BOT_NAME}\n` +
    `${on(w.attivo)} Benvenuto **${w.attivo ? 'ATTIVO' : 'DISATTIVATO'}** • Canale: ${w.canale ? `<#${w.canale}>` : '⚠️ *non scelto*'}\n` +
    `${on(w.card.attiva)} Immagine con banner (sfondo: ${sfondo}) • ${on(w.riquadro)} Riquadro\n` +
    `🌄 Per usare **il tuo banner come sfondo**: \`/benvenuto sfondo:\` e carica l'immagine\n` +
    `Variabili: \`{user}\` \`{username}\` \`{server}\` \`{membri}\` (persone, senza bot) \`{id}\` (ID fisso)\n` +
    `👇 **Anteprima** (come la vedrà il nuovo membro):` +
    (warning ? `\n\n${warning}` : '');
  const preview = await welcomeMessage(member, w);

  const rowCanale = new ActionRowBuilder().addComponents(
    new ChannelSelectMenuBuilder().setCustomId('wb:canale').setPlaceholder('📢 Scegli il canale del benvenuto')
      .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement),
  );
  const layoutNow = `${w.card.layout}-${w.card.forma}`;
  const rowLayout = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder().setCustomId('wb:layout').setPlaceholder('🎛️ Disposizione immagine')
      .addOptions(Object.entries(LAYOUTS).map(([value, label]) => ({ label, value, default: value === layoutNow }))),
  );
  const rowEdit = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('wb:testi').setLabel('Testi messaggio').setEmoji('✏️').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('wb:stile').setLabel('Colore riquadro').setEmoji('🎨').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('wb:cardtesti').setLabel('Scritte immagine').setEmoji('🖼️').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('wb:cardstile').setLabel('Sfondo & colori immagine').setEmoji('🌄').setStyle(ButtonStyle.Primary),
  );
  const rowAzioni = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('wb:toggle').setLabel(w.attivo ? 'Disattiva' : 'Attiva')
      .setEmoji(w.attivo ? '🔕' : '✅').setStyle(w.attivo ? ButtonStyle.Danger : ButtonStyle.Success),
    new ButtonBuilder().setCustomId('wb:card').setLabel(w.card.attiva ? 'Togli immagine' : 'Metti immagine').setEmoji('🖼️').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('wb:riquadro').setLabel(w.riquadro ? 'Togli riquadro' : 'Metti riquadro').setEmoji('🗂️').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('wb:test').setLabel('Invia prova').setEmoji('📨').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('wb:reset').setLabel('Ripristina').setEmoji('🔄').setStyle(ButtonStyle.Secondary),
  );

  return {
    content: `${header}\n\n${preview.content ?? ''}`.slice(0, 2000),
    embeds: preview.embeds,
    files: preview.files,
    attachments: [],
    components: [rowCanale, rowLayout, rowEdit, rowAzioni],
  };
}

const input = (id, label, value, style = TextInputStyle.Short, max = 256, placeholder = '') => {
  const t = new TextInputBuilder().setCustomId(id).setLabel(label).setStyle(style)
    .setRequired(false).setMaxLength(max);
  if (value !== undefined && value !== null && value !== '') t.setValue(String(value).slice(0, max));
  if (placeholder) t.setPlaceholder(placeholder);
  return new ActionRowBuilder().addComponents(t);
};

const modalTesti = (w) => new ModalBuilder().setCustomId('wbm:testi').setTitle('✏️ Testi del messaggio').addComponents(
  input('sopra', 'Messaggio sopra (fuori dal riquadro)', w.sopra, TextInputStyle.Short, 300, 'Es: {user} è arrivato in città! 🌴'),
  input('autore', 'Autore (riga piccola in alto)', w.autore, TextInputStyle.Short, 256, 'Es: VICE LIFE RP'),
  input('titolo', 'Titolo', w.titolo, TextInputStyle.Short, 256),
  input('descrizione', 'Descrizione (puoi andare a capo)', w.descrizione, TextInputStyle.Paragraph, 4000),
  input('footer', 'Footer (riga in basso)', w.footer, TextInputStyle.Short, 1024),
);

const modalStile = (w) => new ModalBuilder().setCustomId('wbm:stile').setTitle('🎨 Colore riquadro').addComponents(
  input('colore', 'Colore riquadro (codice HEX)', w.colore, TextInputStyle.Short, 7, '#ff2d95'),
  input('immagine', 'Immagine grande (se immagine benvenuto OFF)', w.immagine, TextInputStyle.Short, 1000, 'https://... (vuoto = nessuna)'),
  input('miniatura', 'Miniatura: avatar / server / link / vuoto', w.miniatura, TextInputStyle.Short, 1000, 'avatar'),
);

const modalCardTesti = (c) => new ModalBuilder().setCustomId('wbm:cardtesti').setTitle('🖼️ Scritte sull\'immagine').addComponents(
  input('riga1', 'Riga 1 (grande)', c.riga1, TextInputStyle.Short, 60, '{username}'),
  input('riga2', 'Riga 2 (colorata)', c.riga2, TextInputStyle.Short, 60, 'Sei il cittadino n° {membri}'),
  input('riga3', 'Riga 3 (piccola, facoltativa)', c.riga3, TextInputStyle.Short, 80, 'Es: ID {id}'),
  input('font', 'Font (es. Arial, Impact, Bahnschrift)', c.font, TextInputStyle.Short, 60, 'Arial'),
);

const modalCardStile = (c) => new ModalBuilder().setCustomId('wbm:cardstile').setTitle('🌄 Sfondo & colori immagine').addComponents(
  input('sfondo', 'Sfondo: vicelife / file / link / vuoto', c.sfondo, TextInputStyle.Short, 1000, 'vicelife = banner ufficiale, file = caricato con /benvenuto'),
  input('oscuramento', 'Oscuramento sfondo da 0 a 90 (%)', String(c.oscuramento), TextInputStyle.Short, 2, '40'),
  input('accento', 'Colore bordo avatar / riga 2 / cornice', c.accento, TextInputStyle.Short, 7, '#ff2d95'),
  input('coloreTesto', 'Colore scritte', c.coloreTesto, TextInputStyle.Short, 7, '#ffffff'),
  input('cornice', 'Cornice intorno all\'immagine? (si / no)', c.cornice ? 'si' : 'no', TextInputStyle.Short, 2, 'si'),
);

async function handleWelcomePanel(i) {
  const gid = i.guild.id;
  const show = async (warning) => {
    if (!i.deferred && !i.replied) await i.deferUpdate();
    return i.editReply(await panel(i.member, warning));
  };

  if (i.isChannelSelectMenu() && i.customId === 'wb:canale') {
    setWelcome(gid, { canale: i.values[0] });
    return show(`✅ Canale impostato su <#${i.values[0]}>.`);
  }
  if (i.isStringSelectMenu() && i.customId === 'wb:layout') {
    const [layout, forma] = i.values[0].split('-');
    setCard(gid, { layout, forma, attiva: true });
    return show(`✅ Disposizione: ${LAYOUTS[i.values[0]]}`);
  }

  if (i.isButton()) {
    const w = getWelcome(gid);
    switch (i.customId) {
      case 'wb:testi': return i.showModal(modalTesti(w));
      case 'wb:stile': return i.showModal(modalStile(w));
      case 'wb:cardtesti': return i.showModal(modalCardTesti(w.card));
      case 'wb:cardstile': return i.showModal(modalCardStile(w.card));
      case 'wb:card':
        setCard(gid, { attiva: !w.card.attiva });
        return show(!w.card.attiva ? '🖼️ Immagine di benvenuto **attivata**.' : '🖼️ Immagine di benvenuto **tolta**.');
      case 'wb:riquadro':
        setWelcome(gid, { riquadro: !w.riquadro });
        return show(!w.riquadro ? '🗂️ Riquadro **attivato**.' : '🗂️ Riquadro **tolto**: verrà inviata solo l\'immagine (con il messaggio sopra).');
      case 'wb:toggle':
        if (!w.attivo && !w.canale) return show('⚠️ Prima scegli il **canale** dal menu.');
        setWelcome(gid, { attivo: !w.attivo });
        return show(!w.attivo ? '✅ Benvenuto **attivato**!' : '🔕 Benvenuto **disattivato**.');
      case 'wb:test':
        if (!w.canale) return show('⚠️ Prima scegli il **canale** dal menu.');
        await i.deferUpdate();
        try {
          const ok = await sendWelcome(i.member, true);
          return show(ok ? `📨 Prova inviata in <#${w.canale}>!` : '⚠️ Non riesco a trovare il canale.');
        } catch (e) {
          return show(`❌ Non posso scrivere in <#${w.canale}>: ${e.message}`);
        }
      case 'wb:reset':
        setWelcome(gid, { ...DEFAULT_WELCOME, card: { ...DEFAULT_CARD, sfondo: w.card.sfondo }, canale: w.canale, attivo: w.attivo });
        return show('🔄 Testi e stile ripristinati (sfondo mantenuto).');
    }
  }

  if (i.isModalSubmit()) {
    const v = (id) => i.fields.getTextInputValue(id).trim();
    const errori = [];
    if (i.customId === 'wbm:testi') {
      setWelcome(gid, { sopra: v('sopra'), autore: v('autore'), titolo: v('titolo'), descrizione: v('descrizione'), footer: v('footer') });
      return show('✅ Testi aggiornati.');
    }
    if (i.customId === 'wbm:stile') {
      const changes = {};
      const colore = hex(v('colore'));
      if (colore) changes.colore = colore; else if (colore === undefined) errori.push('colore non valido');
      const immagine = v('immagine');
      if (!immagine || isUrl(immagine)) changes.immagine = immagine; else errori.push('link immagine non valido');
      const m = ['avatar', 'server'].includes(v('miniatura').toLowerCase()) ? v('miniatura').toLowerCase() : v('miniatura');
      if (!m || m === 'avatar' || m === 'server' || isUrl(m)) changes.miniatura = m; else errori.push('miniatura non valida');
      setWelcome(gid, changes);
    }
    if (i.customId === 'wbm:cardtesti') {
      setCard(gid, { riga1: v('riga1'), riga2: v('riga2'), riga3: v('riga3'), font: v('font') || 'Arial', attiva: true });
    }
    if (i.customId === 'wbm:cardstile') {
      const changes = { attiva: true };
      const sf = v('sfondo');
      if (!sf || isUrl(sf) || ['file', 'vicelife'].includes(sf.toLowerCase())) changes.sfondo = ['file', 'vicelife'].includes(sf.toLowerCase()) ? sf.toLowerCase() : sf;
      else errori.push('sfondo non valido (link, file o vuoto)');
      const osc = parseInt(v('oscuramento'), 10);
      if (!Number.isNaN(osc)) changes.oscuramento = Math.min(90, Math.max(0, osc));
      const acc = hex(v('accento')); if (acc) changes.accento = acc; else if (acc === undefined) errori.push('colore bordo non valido');
      const ct = hex(v('coloreTesto')); if (ct) changes.coloreTesto = ct; else if (ct === undefined) errori.push('colore scritte non valido');
      changes.cornice = !/^n/i.test(v('cornice'));
      setCard(gid, changes);
    }
    return show(errori.length ? `⚠️ Salvato, ma: ${errori.join(', ')}.` : '✅ Salvato!');
  }
}

// ================================================
//   AUTORUOLI (ruoli dati in automatico a chi entra)
// ================================================
// Chi entra nel server riceve SOLO questi ruoli (Cittadinanza + In attesa whitelist)
const DEFAULT_AUTORUOLI = ['1575145330767433879', '1575145467061477586'];
function getAutoruoli(guildId) {
  const c = cfg(guildId);
  if ((c.autoruoliVer ?? 1) < 2) { c.autoruoli = [...DEFAULT_AUTORUOLI]; c.autoruoliVer = 2; save(); }
  return (c.autoruoli ??= [...DEFAULT_AUTORUOLI]);
}

async function giveAutoruoli(member) {
  if (member.user.bot) return;
  const tutti = getAutoruoli(member.guild.id);
  const ruoli = tutti.filter((r) => member.guild.roles.cache.has(r));
  const mancanti = tutti.filter((r) => !ruoli.includes(r));
  if (mancanti.length) console.warn(`[autoruoli] Questi ruoli non esistono nel server: ${mancanti.join(', ')}`);
  if (!ruoli.length) return;
  try {
    await member.roles.add(ruoli, 'Autoruoli VICE LIFE');
    console.log(`🎭 Ruoli dati a ${member.user.username}`);
  } catch (e) {
    console.warn(`❌ [autoruoli] ${member.user.username}: ${e.message} -> sposta il ruolo VICE LIFE🌴 SOPRA questi ruoli e dagli il permesso Amministratore`);
  }
}

// Toglie il messaggio automatico di Discord "X ha deciso di fare un salto nel server"
async function nascondiMessaggioIngresso(guild) {
  const flag = GuildSystemChannelFlags.SuppressJoinNotifications;
  if (guild.systemChannelFlags.has(flag)) return;
  await guild.setSystemChannelFlags(new SystemChannelFlagsBitField(guild.systemChannelFlags).add(flag))
    .then(() => console.log(`🔇 Messaggio automatico di ingresso di Discord disattivato su ${guild.name}`))
    .catch((e) => console.warn(`[ingresso] Non riesco a disattivare il messaggio di Discord: ${e.message}`));
}

function autoruoliPanel(guild, warning = '') {
  const ruoli = getAutoruoli(guild.id);
  const validi = ruoli.filter((r) => guild.roles.cache.has(r));
  const select = new RoleSelectMenuBuilder().setCustomId('ar:set')
    .setPlaceholder('🎭 Scegli i ruoli da dare in automatico').setMinValues(0).setMaxValues(10);
  if (validi.length) select.setDefaultRoles(...validi);
  return {
    content: (
      `## 🎭 Autoruoli – ${BOT_NAME}
` +
      `Chi entra nel server per la prima volta riceve in automatico:
` +
      (validi.length ? validi.map((r) => `• <@&${r}>`).join('\n') : '*nessun ruolo*') +
      `\n\n⚠️ Il ruolo **${BOT_NAME}** deve stare **sopra** questi ruoli (Impostazioni server → Ruoli).` +
      (warning ? `\n\n${warning}` : '')
    ).slice(0, 2000),
    components: [
      new ActionRowBuilder().addComponents(select),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('ar:memoria')
          .setLabel(memoria.attiva(guild.id) ? 'Rimetti vecchi ruoli a chi rientra: ON' : 'Rimetti vecchi ruoli a chi rientra: OFF')
          .setEmoji('♻️').setStyle(memoria.attiva(guild.id) ? ButtonStyle.Success : ButtonStyle.Secondary),
      ),
    ],
  };
}

// ---------- comandi slash ----------
const commands = [
  new SlashCommandBuilder()
    .setName('lista')
    .setDescription('Crea la categoria con le statistiche del server')
    .addStringOption((o) => o.setName('nome').setDescription('Nome della categoria (default: 📊 VICE LIFE STATS 🌴)'))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .setDMPermission(false),
  new SlashCommandBuilder()
    .setName('rimuovi-lista')
    .setDescription('Elimina la categoria statistiche creata con /lista')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .setDMPermission(false),
  new SlashCommandBuilder()
    .setName('benvenuto')
    .setDescription('Apri il pannello per creare il messaggio di benvenuto')
    .addAttachmentOption((o) => o.setName('sfondo').setDescription('Carica qui il tuo banner da usare come sfondo dell\'immagine di benvenuto'))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setDMPermission(false),
  new SlashCommandBuilder()
    .setName('autoruoli')
    .setDescription('Scegli i ruoli che ricevono in automatico i nuovi membri')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .setDMPermission(false),
].map((c) => c.toJSON()).concat(tickets.command, idfissi.commands, community.commands, statoServer.command, wl.command, richiestaWl.command, esitoWl.command, storie.command);

// ---------- client ----------
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildMessageReactions, GatewayIntentBits.GuildVoiceStates],
  partials: [Partials.GuildMember, Partials.Message, Partials.Channel, Partials.Reaction, Partials.User],
});

client.once('clientReady', async () => {
  console.log(`✅ ${client.user.tag} online su ${client.guilds.cache.size} server`);
  client.user.setActivity('VICE LIFE RP 🌴', { type: ActivityType.Watching });
  if (client.user.username !== BOT_NAME) {
    await client.user.setUsername(BOT_NAME).catch(() =>
      console.log(`ℹ️  Imposta il nome "${BOT_NAME}" dal Developer Portal se non cambia in automatico.`));
  }

  if (process.env.GUILD_ID) {
    const g = await client.guilds.fetch(process.env.GUILD_ID);
    await g.commands.set(commands);
    console.log(`✅ Comandi registrati sul server ${g.name}`);
  } else {
    await client.application.commands.set(commands);
    console.log('✅ Comandi registrati globalmente (possono servire fino a 1 ora)');
  }

  for (const g of client.guilds.cache.values()) {
    await nascondiMessaggioIngresso(g);
    await g.members.fetch().catch(() => {});
    memoria.salvaTutti(g);
    await idfissi.onReady(g);
    await tickets.onReady(g).catch(() => {});
    await community.onReady(g).catch(() => {});
    await statoServer.onReady(g)?.catch?.(() => {});
    await wl.onReady(g).catch(() => {});
    await richiestaWl.onReady(g)?.catch?.(() => {});
    await esitoWl.onReady(g).catch(() => {});
    await storie.onReady(g).catch(() => {});
    await voce.onReady(g).catch(() => {});
    if (cfg(g.id).stats) await updateStats(g);
  }
  setInterval(() => client.guilds.cache.forEach((g) => cfg(g.id).stats && scheduleStats(g)), UPDATE_EVERY_MS);
  community.avviaTimer(client); // scadenze di sondaggi e giveaway
});

client.on('guildCreate', (g) => nascondiMessaggioIngresso(g));
client.on('voiceStateUpdate', (oldState, newState) => voce.onVoiceUpdate(oldState, newState));
client.on('messageReactionAdd', (reaction, user) => community.onReaction(reaction, user));
client.on('guildMemberAdd', async (member) => {
  console.log(`👋 Nuovo membro: ${member.user.username}`);
  // Chi rientra riprende i SUOI ruoli; i ruoli d'ingresso li riceve solo chi entra per la prima volta
  const rientra = memoria.conosciuto(member);
  const vecchioNick = await memoria.ripristina(member);
  if (!rientra) await giveAutoruoli(member);
  await idfissi.onJoin(member, vecchioNick);
  memoria.salva(member);
  await sendWelcome(member).catch((e) => console.warn(`[benvenuto] ${member.guild.name}: ${e.message}`));
  scheduleStats(member.guild);
});
client.on('guildMemberUpdate', async (oldM, newM) => {
  await idfissi.onUpdate(oldM, newM).catch(() => {});
  memoria.salva(newM);
});
client.on('guildMemberRemove', (member) => {
  memoria.salva(member); // ruoli e nickname restano salvati per quando rientra
  scheduleStats(member.guild);
});

client.on('interactionCreate', async (i) => {
  if (!i.guild) return;
  try {
    // Sistema ticket
    if (tickets.isTicket(i)) return await tickets.handle(i);
    // Storie dei personaggi
    if (storie.isStoria(i)) return await storie.handle(i);
    // Esito whitelist
    if (esitoWl.isEsito(i)) return await esitoWl.handle(i);
    // Richieste whitelist
    if (richiestaWl.isRichiesta(i)) return await richiestaWl.handle(i);
    // Info whitelist
    if (wl.isWl(i)) return await wl.handle(i);
    // Stato server
    if (statoServer.isStato(i)) return await statoServer.handle(i);
    // Annunci, link, sondaggi, giveaway
    if (community.isCommunity(i)) return await community.handle(i);
    // ID fissi
    if (idfissi.isId(i)) return await idfissi.handle(i);

    // Pannello autoruoli
    if (i.customId === 'ar:memoria') {
      if (!i.memberPermissions?.has(PermissionFlagsBits.ManageRoles)) return i.reply({ content: '❌ Non hai i permessi.', flags: EPHEMERAL });
      const on = memoria.toggle(i.guild.id);
      return i.update(autoruoliPanel(i.guild, on ? '♻️ Chi rientra riavrà i suoi vecchi ruoli.' : '♻️ Ripristino ruoli disattivato.'));
    }
    if (i.customId === 'ar:set') {
      if (!i.memberPermissions?.has(PermissionFlagsBits.ManageRoles)) return i.reply({ content: '❌ Non hai i permessi.', flags: EPHEMERAL });
      cfg(i.guild.id).autoruoli = i.values;
      save();
      return i.update(autoruoliPanel(i.guild, '✅ Autoruoli salvati!'));
    }

    // Pannello benvenuto (pulsanti, menu, finestre)
    if (i.customId?.startsWith('wb')) {
      if (!i.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
        return i.reply({ content: '❌ Non hai i permessi.', flags: EPHEMERAL });
      }
      return await handleWelcomePanel(i);
    }
    if (!i.isChatInputCommand()) return;
    const c = cfg(i.guild.id);

    // ---- /autoruoli ----
    if (i.commandName === 'autoruoli') {
      return i.reply({ ...autoruoliPanel(i.guild), flags: EPHEMERAL });
    }

    // ---- /benvenuto ----
    if (i.commandName === 'benvenuto') {
      await i.deferReply({ flags: EPHEMERAL });
      const file = i.options.getAttachment('sfondo');
      let msg = '';
      if (file) {
        if (!file.contentType?.startsWith('image/')) msg = '❌ Il file caricato non è un\'immagine.';
        else {
          try {
            await saveBackground(i.guild.id, file.url);
            setCard(i.guild.id, { sfondo: 'file', attiva: true });
            msg = '✅ Banner salvato come **sfondo** dell\'immagine di benvenuto!';
          } catch (e) { msg = `❌ Non riesco a usare questa immagine: ${e.message}`; }
        }
      }
      const p = await panel(i.member, msg);
      delete p.attachments;
      return i.editReply(p);
    }

    // ---- /lista ----
    if (i.commandName === 'lista') {
      await i.deferReply({ flags: EPHEMERAL });
      if (c.stats && i.guild.channels.cache.has(c.stats.category)) {
        return i.editReply('⚠️ La categoria statistiche esiste già. Usa `/rimuovi-lista` per ricrearla.');
      }
      await i.guild.members.fetch();
      const nome = i.options.getString('nome') || '📊 VICE LIFE STATS 🌴';
      const lock = [
        { id: i.guild.roles.everyone.id, allow: [PermissionFlagsBits.ViewChannel], deny: [PermissionFlagsBits.Connect] },
        { id: client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect, PermissionFlagsBits.ManageChannels] },
      ];
      const category = await i.guild.channels.create({
        name: nome, type: ChannelType.GuildCategory, position: 0, permissionOverwrites: lock,
      });
      const channels = {};
      for (const s of STATS) {
        const ch = await i.guild.channels.create({
          name: statName(s, i.guild), type: ChannelType.GuildVoice, parent: category.id, permissionOverwrites: lock,
        });
        channels[s.key] = ch.id;
      }
      c.stats = { category: category.id, channels, lastUpdate: Date.now() };
      save();
      return i.editReply(`✅ Categoria **${nome}** creata! I contatori si aggiornano da soli (max ogni 10 minuti, limite di Discord).`);
    }

    // ---- /rimuovi-lista ----
    if (i.commandName === 'rimuovi-lista') {
      if (!c.stats) return i.reply({ content: '❌ Nessuna categoria statistiche trovata.', flags: EPHEMERAL });
      await i.deferReply({ flags: EPHEMERAL });
      for (const id of [...Object.values(c.stats.channels), c.stats.category]) {
        await i.guild.channels.cache.get(id)?.delete().catch(() => {});
      }
      c.stats = null;
      save();
      return i.editReply('🗑️ Categoria statistiche eliminata.');
    }
  } catch (err) {
    console.error(err);
    const msg = { content: `❌ Errore: ${err.message}\nControlla che il bot abbia il permesso **Gestisci canali**.`, flags: EPHEMERAL };
    if (i.deferred || i.replied) i.followUp(msg).catch(() => {});
    else i.reply(msg).catch(() => {});
  }
});

if (!process.env.DISCORD_TOKEN) {
  console.error('❌ Manca DISCORD_TOKEN nel file .env');
  process.exit(1);
}
loadCanvas(); // prepara la libreria per le immagini (la installa da sola se manca)
// Prima controlla gli aggiornamenti su GitHub, poi accende il bot
require('./updater').avvia().then((ok) => { if (ok) client.login(process.env.DISCORD_TOKEN); });
