// ================================================
//   VICE LIFE🌴  -  ID FISSI
//   Ogni player riceve un numero fisso in base all'ordine di ingresso
//   (es. ale_nox2 [0008]). Se esce e rientra tiene lo stesso numero.
//   Il campo "gioco" è pronto per collegare l'ID in gioco più avanti.
// ================================================
const {
  PermissionFlagsBits, MessageFlags, SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle,
} = require('discord.js');

const EPH = MessageFlags.Ephemeral;
let cfg; let save;

const FORMATI = {
  '{nome} [{id}]': 'ale_nox2 [0008]',
  '[{id}] {nome}': '[0008] ale_nox2',
  '{nome} | {id}': 'ale_nox2 | 0008',
  '#{id} {nome}': '#0008 ale_nox2',
  '{nome} ({id})': 'ale_nox2 (0008)',
};

const FONDATORE = '1003806561254260887'; // ha l'ID 0001 (se non è staff senza ID)

// Chi ha uno di questi ruoli NON ha un ID (staff)
const RUOLI_SENZA_ID = [
  '1575142910888906862', '1575143071564304454', '1575143178414063649', '1575143272404357200', '1575143396572528722',
];
const esente = (member) => RUOLI_SENZA_ID.some((r) => member.roles?.cache?.has(r));

// Membri in ordine di ingresso: prima il fondatore, poi gli altri. Bot esclusi.
async function membriInOrdine(guild) {
  let lista = guild.members.cache;
  if (lista.size < guild.memberCount) lista = await guild.members.fetch().catch(() => guild.members.cache);
  return [...lista.values()].filter((m) => !m.user.bot && !esente(m))
    .sort((a, b) => (a.id === FONDATORE ? -1 : b.id === FONDATORE ? 1 : (a.joinedTimestamp ?? 0) - (b.joinedTimestamp ?? 0)));
}

const get = (gid) => (cfg(gid).idfissi ??= { attivo: true, formato: '{nome} [{id}]', cifre: 4, prossimo: 1, utenti: {} });
const pad = (n, c) => String(n).padStart(c, '0');
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const formatRegex = (formato) => new RegExp(`^${esc(formato).replace('\\{nome\\}', '(.*?)').replace('\\{id\\}', '(\\d+)')}$`);

// Numero fisso del player (lo crea se non c'è)
function idOf(member, crea = true) {
  const d = get(member.guild.id);
  if (esente(member)) return null; // staff: niente ID
  let u = d.utenti[member.id];
  if (typeof u === 'number') u = d.utenti[member.id] = { n: u }; // compatibilità
  if (!u && crea && member.id === FONDATORE) {
    u = d.utenti[member.id] = { n: 1, gioco: null };
    save();
  }
  if (!u && crea) {
    u = d.utenti[member.id] = { n: d.prossimo++, gioco: null };
    save();
  }
  return u;
}

function nickFor(member, base) {
  const d = get(member.guild.id);
  const u = idOf(member);
  const id = pad(u.n, d.cifre);
  const vuoto = d.formato.replace('{id}', id).replace('{nome}', '');
  const nome = base.slice(0, Math.max(1, 32 - vuoto.length));
  return d.formato.replace('{id}', id).replace('{nome}', nome).trim().slice(0, 32);
}

// Toglie un eventuale numero vecchio dal nickname, così resta solo il nome
function baseName(member, nick) {
  const d = get(member.guild.id);
  const m = nick.match(formatRegex(d.formato));
  return (m ? (d.formato.indexOf('{nome}') < d.formato.indexOf('{id}') ? m[1] : m[2]) : nick).trim()
    || member.user.globalName || member.user.username;
}

// Staff senza ID: toglie il numero dal nickname
async function togliNumero(member) {
  if (!member.nickname || member.id === member.guild.ownerId || !member.manageable) return false;
  const d = get(member.guild.id);
  if (!formatRegex(d.formato).test(member.nickname)) return false;
  const base = baseName(member, member.nickname);
  const pulito = base === (member.user.globalName ?? member.user.username) ? null : base;
  await member.setNickname(pulito, 'Staff: nessun ID');
  return true;
}

async function applyNick(member, base) {
  if (esente(member)) return togliNumero(member);
  if (member.user.bot || member.id === member.guild.ownerId || !member.manageable) return false;
  const nick = nickFor(member, base ?? baseName(member, member.nickname ?? member.user.globalName ?? member.user.username));
  if (member.nickname === nick) return true;
  await member.setNickname(nick, 'ID fisso VICE LIFE');
  return true;
}

// ---------- eventi ----------
async function onJoin(member, vecchioNick = null) {
  if (member.user.bot || !get(member.guild.id).attivo) return;
  if (esente(member)) { await togliNumero(member).catch(() => {}); return; }
  idOf(member);
  try {
    // Se rientra, riprende il suo vecchio nome (es. nome RP) con lo stesso ID
    const base = vecchioNick ? baseName(member, vecchioNick) : (member.user.globalName ?? member.user.username);
    const ok = await applyNick(member, base);
    console.log(ok ? `🆔 ${member.user.username} -> ${member.nickname ?? nickFor(member, member.user.username)}`
      : `⚠️ [id] Non posso rinominare ${member.user.username}: il ruolo VICE LIFE🌴 deve stare SOPRA i suoi ruoli`);
  } catch (e) {
    console.warn(`❌ [id] ${member.user.username}: ${e.message} -> dai al bot il permesso Amministratore e mettilo in cima ai ruoli`);
  }
}

// Se un player cambia nickname, il numero viene rimesso in automatico
async function onUpdate(oldM, newM) {
  const d = get(newM.guild.id);
  if (!d.attivo || newM.user.bot) return;
  const ruoliCambiati = !oldM.roles?.cache || oldM.roles.cache.size !== newM.roles.cache.size
    || oldM.roles.cache.some((r) => !newM.roles.cache.has(r.id));
  if (oldM.nickname === newM.nickname && !ruoliCambiati) return;
  if (/^\d+ \| /.test(newM.nickname ?? '')) return; // ha il numero della fila d'attesa: lo gestisce voce.js
  if (esente(newM)) { await togliNumero(newM).catch(() => {}); return; } // diventato staff
  const u = idOf(newM, ruoliCambiati); // non è più staff: riprende/riceve l'ID
  if (!u) return;
  const atteso = nickFor(newM, baseName(newM, newM.nickname ?? newM.user.globalName ?? newM.user.username));
  if (newM.nickname !== atteso) await applyNick(newM).catch(() => {});
}

// ---------- pannello ----------
function panel(guild, warning = '') {
  const d = get(guild.id);
  const content = (
    `## 🆔 ID Fissi – VICE LIFE🌴\n` +
    `${d.attivo ? '🟢 **ATTIVO**' : '🔴 **DISATTIVATO**'} • Formato: \`${FORMATI[d.formato] ?? d.formato}\`\n` +
    `👥 ID assegnati: **${Object.keys(d.utenti).length}** • Prossimo ID: **${pad(d.prossimo, d.cifre)}**\n\n` +
    `Ogni player che entra riceve il suo numero fisso nel nickname. Se esce e rientra tiene **lo stesso** numero, e se cambia nickname il numero viene rimesso da solo.\n` +
    `👮 Lo staff con i ruoli ${RUOLI_SENZA_ID.map((r) => `<@&${r}>`).join(' ')} **non ha un ID**.\n` +
    `ℹ️ Il proprietario del server e chi ha un ruolo più alto del bot non possono essere rinominati (limite di Discord).` +
    (warning ? `\n\n${warning}` : '')
  ).slice(0, 2000);
  return {
    content,
    components: [
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder().setCustomId('id:formato').setPlaceholder('🔤 Formato del nickname')
          .addOptions(Object.entries(FORMATI).map(([value, label]) => ({ label, value, default: value === d.formato }))),
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('id:toggle').setLabel(d.attivo ? 'Disattiva' : 'Attiva')
          .setEmoji(d.attivo ? '🔕' : '✅').setStyle(d.attivo ? ButtonStyle.Danger : ButtonStyle.Success),
        new ButtonBuilder().setCustomId('id:tutti').setLabel('Dai l\'ID ai membri già nel server').setEmoji('👥').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('id:rinumera').setLabel('Rinumera tutti').setEmoji('🔢').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('id:impostazioni').setLabel('Cifre & prossimo numero').setEmoji('⚙️').setStyle(ButtonStyle.Secondary),
      ),
    ],
  };
}

const modalImpostazioni = (d) => new ModalBuilder().setCustomId('idm:impostazioni').setTitle('⚙️ Impostazioni ID').addComponents(
  new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('cifre').setLabel('Quante cifre? (es. 4 = 0008)')
    .setStyle(TextInputStyle.Short).setMaxLength(1).setValue(String(d.cifre))),
  new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('prossimo').setLabel('Prossimo numero da dare')
    .setStyle(TextInputStyle.Short).setMaxLength(6).setValue(String(d.prossimo))),
);

async function assegnaTutti(guild) {
  const d = get(guild.id);
  const membri = await membriInOrdine(guild);
  for (const m of guild.members.cache.values()) if (!m.user.bot && esente(m)) await togliNumero(m).catch(() => {});
  let nuovi = 0; let rinominati = 0; let saltati = 0;
  for (const m of membri) {
    if (!d.utenti[m.id]) { idOf(m); nuovi++; }
    try { (await applyNick(m)) ? rinominati++ : saltati++; } catch { saltati++; }
  }
  return { nuovi, rinominati, saltati };
}

// Rinumera tutti in ordine di ingresso: proprietario incluso, bot esclusi
async function rinumera(guild) {
  const d = get(guild.id);
  const membri = await membriInOrdine(guild);
  const vecchi = d.utenti;
  d.utenti = {};
  membri.forEach((m, n) => { d.utenti[m.id] = { n: n + 1, gioco: vecchi[m.id]?.gioco ?? null }; });
  d.prossimo = Object.keys(d.utenti).length + 1;
  save();
  for (const m of guild.members.cache.values()) if (!m.user.bot && esente(m)) await togliNumero(m).catch(() => {});
  for (const m of membri) await applyNick(m).catch(() => {});
  console.log(`🆔 ID rinumerati in ordine di ingresso (staff senza ID e bot esclusi): ${membri.length} player`);
  return membri.length;
}

// All'avvio: la prima volta rinumera, poi dà l'ID a chi non ce l'ha ancora
async function onReady(guild) {
  const d = get(guild.id);
  if (!d.attivo) return;
  try {
    if ((d.idVer ?? 1) < 4) { await rinumera(guild); d.idVer = 4; save(); return; }
    await assegnaTutti(guild);
  } catch (e) { console.warn(`[id] ${e.message}`); }
}

// ID del player come testo (es. 0008), per i messaggi
function idText(member) {
  const d = get(member.guild.id);
  if (esente(member)) return 'STAFF';
  const u = d.utenti[member.id];
  if (!u) return '?';
  return pad(typeof u === 'number' ? u : u.n, d.cifre);
}

async function handle(i) {
  // /id [utente] -> mostra l'ID di qualcuno
  if (i.isChatInputCommand() && i.commandName === 'id') {
    const user = i.options.getUser('utente') ?? i.user;
    const d = get(i.guild.id);
    const membro = await i.guild.members.fetch(user.id).catch(() => null);
    if (membro && esente(membro)) return i.reply({ content: `👮 <@${user.id}> fa parte dello staff: non ha un ID.`, flags: EPH });
    const u = d.utenti[user.id];
    if (!u) return i.reply({ content: `❌ ${user.username} non ha ancora un ID.`, flags: EPH });
    const n = typeof u === 'number' ? u : u.n;
    const gioco = u.gioco ? `\n🎮 ID in gioco: **${u.gioco}**` : '';
    return i.reply({ content: `🆔 L'ID di <@${user.id}> è **${pad(n, d.cifre)}**${gioco}`, flags: EPH });
  }
  if (i.isChatInputCommand() && i.commandName === 'idfissi') return i.reply({ ...panel(i.guild), flags: EPH });

  if (!i.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) return i.reply({ content: '❌ Non hai i permessi.', flags: EPH });
  const d = get(i.guild.id);
  if (i.customId === 'id:formato') { d.formato = i.values[0]; save(); return i.update(panel(i.guild, '✅ Formato salvato. Premi 👥 per aggiornare i nickname di chi è già nel server.')); }
  if (i.customId === 'id:toggle') { d.attivo = !d.attivo; save(); return i.update(panel(i.guild, d.attivo ? '✅ ID fissi attivati.' : '🔕 ID fissi disattivati.')); }
  if (i.customId === 'id:impostazioni') return i.showModal(modalImpostazioni(d));
  if (i.customId === 'idm:impostazioni') {
    const cifre = parseInt(i.fields.getTextInputValue('cifre'), 10);
    const prossimo = parseInt(i.fields.getTextInputValue('prossimo'), 10);
    if (cifre >= 1 && cifre <= 6) d.cifre = cifre;
    if (prossimo >= 1) d.prossimo = prossimo;
    save();
    return i.update(panel(i.guild, '✅ Impostazioni salvate.'));
  }
  if (i.customId === 'id:rinumera') {
    await i.update(panel(i.guild, '⏳ Rinumero tutti in ordine di ingresso (staff senza ID esclusi)...'));
    const n = await rinumera(i.guild);
    return i.editReply(panel(i.guild, `✅ Rinumerati ${n} player in ordine di ingresso (staff senza ID esclusi).`));
  }
  if (i.customId === 'id:tutti') {
    await i.update(panel(i.guild, '⏳ Sto assegnando gli ID in ordine di ingresso... (può volerci un po\' se siete in tanti)'));
    const r = await assegnaTutti(i.guild);
    return i.editReply(panel(i.guild, `✅ Fatto! Nuovi ID: **${r.nuovi}** • Nickname aggiornati: **${r.rinominati}** • Non modificabili: **${r.saltati}**`));
  }
}

module.exports = {
  init(cfgFn, saveFn) { cfg = cfgFn; save = saveFn; },
  commands: [
    new SlashCommandBuilder().setName('idfissi').setDescription('Gestisci gli ID fissi dei player (numero nel nickname)')
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild).setDMPermission(false).toJSON(),
    new SlashCommandBuilder().setName('id').setDescription('Mostra l\'ID fisso di un player')
      .addUserOption((o) => o.setName('utente').setDescription('Di chi vuoi vedere l\'ID (vuoto = il tuo)'))
      .setDMPermission(false).toJSON(),
  ],
  isId: (i) => (i.isChatInputCommand() && ['id', 'idfissi'].includes(i.commandName)) || /^idm?:/.test(i.customId ?? ''),
  handle, onJoin, onUpdate, onReady, idText, esente,
  _panel: panel, _nickFor: nickFor, _baseName: baseName, _get: get,
};
