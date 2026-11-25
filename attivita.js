// ================================================
//   VICE LIFE🌴  -  RICHIESTA ATTIVITÀ
//   Pannello nel canale attività: il player preme il pulsante, compila
//   nome, tipo e descrizione dell'attività e tagga i membri (minimo 5).
//   La richiesta viene pubblicata nel canale e lo staff la approva o la rifiuta.
// ================================================
const path = require('path');
const {
  MessageFlags, EmbedBuilder, SlashCommandBuilder, AttachmentBuilder, PermissionFlagsBits,
  ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle,
  LabelBuilder, UserSelectMenuBuilder,
} = require('discord.js');

const EPH = MessageFlags.Ephemeral;
const ROSA = '#ff2d95';
const CANALE_RICHIESTE = '1575255461714726954'; // canale staff dove arrivano TUTTE le richieste (attività e fazioni)
const RUOLO_APPROVA = '1575144590724304917';    // solo questo ruolo può approvare o rifiutare
const BANNER = 'banner-vicelife.jpg';

// Crea un sistema di richieste (attività, fazioni...) con il suo pannello
function creaRichieste(o) {
const { chiave, P, CANALE, MINIMO, comando, cosa, emoji, titolo, spiegazione, campoNome, campoTipo, tipoPlaceholder, descrPlaceholder } = o;
let cfg; let save;

const get = (gid) => (cfg(gid)[chiave] ??= { canale: CANALE, pannello: null, richieste: {} });
const isStaff = (i) => i.member?.roles?.cache?.has(RUOLO_APPROVA);
const nuovoId = () => Date.now().toString(36);

function pannello(guild) {
  const e = new EmbedBuilder().setColor(ROSA).setTitle(titolo)
    .setDescription(
      `${spiegazione}\n\n` +
      'Premi il pulsante qui sotto e compila il modulo con:\n' +
      `• **${campoNome}**\n• **${campoTipo}**\n• **Descrizione** e progetto\n` +
      `• **Tutti i membri**: minimo **${MINIMO} player** (te compreso)\n\n` +
      '📌 La richiesta deve essere **approvata dallo staff**: riceverai la risposta in privato.',
    )
    .setImage(`attachment://${BANNER}`)
    .setFooter({ text: `VICE LIFE RP 🌴 • Richieste ${cosa}`, iconURL: guild.iconURL() ?? undefined });
  return {
    embeds: [e], files: [new AttachmentBuilder(path.join(__dirname, BANNER), { name: BANNER })], attachments: [],
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`${P}:richiedi`).setLabel(o.pulsante).setEmoji(emoji).setStyle(ButtonStyle.Success),
    )],
  };
}

// Pannello sempre in fondo al canale
async function rimettiPannello(guild, canaleId) {
  const d = get(guild.id);
  const ch = await guild.channels.fetch(canaleId ?? d.canale);
  const msg = await ch.send(pannello(guild));
  if (d.pannello) {
    const old = await guild.channels.fetch(d.pannello.canale).catch(() => null);
    await old?.messages.delete(d.pannello.messaggio).catch(() => {});
  }
  d.pannello = { canale: ch.id, messaggio: msg.id };
  d.canale = ch.id;
  save();
}

const testo = (id, label, { style = TextInputStyle.Short, max = 100, placeholder, required = true } = {}) => {
  const t = new TextInputBuilder().setCustomId(id).setStyle(style).setRequired(required).setMaxLength(max);
  if (placeholder) t.setPlaceholder(placeholder);
  return new LabelBuilder().setLabel(label).setTextInputComponent(t);
};
const modalRichiesta = () => new ModalBuilder().setCustomId(`${P}m:invia`).setTitle(`${emoji} Richiesta ${cosa}`).addLabelComponents(
  testo('nome', campoNome, { max: 80, placeholder: o.nomePlaceholder }),
  testo('tipo', campoTipo, { max: 80, placeholder: tipoPlaceholder }),
  new LabelBuilder().setLabel('Membri').setDescription(`Cerca e seleziona tutti i membri (minimo ${MINIMO} con te)`)
    .setUserSelectMenuComponent(new UserSelectMenuBuilder().setCustomId('membri').setPlaceholder('🔎 Cerca i membri...').setMinValues(MINIMO - 1).setMaxValues(25)),
  testo('descrizione', 'Descrizione e progetto', { style: TextInputStyle.Paragraph, max: 2500, placeholder: descrPlaceholder }),
);

const bottoni = (id, fine = false) => new ActionRowBuilder().addComponents(
  new ButtonBuilder().setCustomId(`${P}:ok:${id}`).setLabel('Approva').setEmoji('✅').setStyle(ButtonStyle.Success).setDisabled(fine),
  new ButtonBuilder().setCustomId(`${P}:no:${id}`).setLabel('Rifiuta').setEmoji('❌').setStyle(ButtonStyle.Danger).setDisabled(fine),
);

async function invia(i) {
  const g = i.guild; const d = get(g.id);
  const v = (k) => i.fields.getTextInputValue(k).trim();
  const scelti = [...(i.fields.getSelectedUsers('membri')?.values() ?? [])].filter((u) => !u.bot).map((u) => u.id);
  const membri = [...new Set([i.user.id, ...scelti])];
  if (membri.length < MINIMO) {
    return i.reply({ content: `❌ Servono almeno **${MINIMO} player** (te compreso). Ne hai indicati **${membri.length}**. I bot non contano.`, flags: EPH });
  }
  const aperta = Object.values(d.richieste).find((r) => r.richiedente === i.user.id && r.stato === 'attesa');
  if (aperta) return i.reply({ content: `⏳ Hai già una richiesta (${cosa}) in attesa: aspetta la risposta dello staff.`, flags: EPH });
  await i.deferReply({ flags: EPH });

  const id = nuovoId();
  const e = new EmbedBuilder().setColor('#f1c40f').setTitle(`${emoji} ${v('nome')}`.slice(0, 256))
    .setAuthor({ name: `Richiesta di ${i.user.username}`, iconURL: i.user.displayAvatarURL() })
    .setDescription(v('descrizione').slice(0, 4096))
    .addFields(
      { name: '🏷️ Tipo', value: v('tipo').slice(0, 1024), inline: true },
      { name: '👑 Richiedente', value: `<@${i.user.id}>`, inline: true },
      { name: `👥 Membri (${membri.length})`, value: membri.map((u) => `<@${u}>`).join(' ').slice(0, 1024) },
      { name: '📌 Stato', value: '⏳ In attesa dello staff' },
    )
    .setFooter({ text: `VICE LIFE RP 🌴 • Richiesta ${cosa}` }).setTimestamp();
  // la richiesta va nel canale staff delle richieste (i membri sono taggati nella richiesta)
  const ch = await g.channels.fetch(CANALE_RICHIESTE).catch(() => null);
  if (!ch) return i.editReply('❌ Non trovo il canale delle richieste: avvisa lo staff.');
  const msg = await ch.send({ content: `🆕 Nuova richiesta **${cosa}** • <@&${RUOLO_APPROVA}>`, embeds: [e], components: [bottoni(id)], allowedMentions: { roles: [RUOLO_APPROVA] } });
  d.richieste[id] = { richiedente: i.user.id, membri, nome: v('nome'), stato: 'attesa', canale: ch.id, messaggio: msg.id, data: Date.now() };
  save();
  return i.editReply('✅ Richiesta inviata allo staff! La valuteranno e riceverai la risposta in privato.');
}

async function segnaStato(msg, testoStato, colore) {
  const e = EmbedBuilder.from(msg.embeds[0]).setColor(colore);
  e.setFields((e.data.fields ?? []).map((f) => (f.name === '📌 Stato' ? { ...f, value: testoStato } : f)));
  await msg.edit({ embeds: [e], components: [bottoni('x', true)] });
}

async function avvisa(guild, r, testoDm) {
  const u = await guild.client.users.fetch(r.richiedente).catch(() => null);
  return u?.send(testoDm).then(() => true).catch(() => false);
}

async function handle(i) {
  if (i.isChatInputCommand()) {
    if (!i.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) return i.reply({ content: '❌ Non hai i permessi.', flags: EPH });
    const canale = i.options.getChannel('canale')?.id ?? get(i.guild.id).canale;
    await rimettiPannello(i.guild, canale);
    return i.reply({ content: `✅ Pannello richieste ${cosa} pubblicato in <#${canale}>.`, flags: EPH });
  }
  const id = i.customId;
  if (id === `${P}:richiedi`) return i.showModal(modalRichiesta());
  if (id === `${P}m:invia`) return invia(i);

  const [a, b, rid] = id.split(':');
  const d = get(i.guild.id); const r = d.richieste[rid];
  if (!isStaff(i)) return i.reply({ content: `❌ Solo il ruolo <@&${RUOLO_APPROVA}> può approvare o rifiutare le richieste.`, flags: EPH, allowedMentions: { parse: [] } });
  if (!r) return i.reply({ content: '❌ Richiesta non trovata.', flags: EPH });
  if (a === P && b === 'ok') {
    r.stato = 'ok'; r.staff = i.user.id; save();
    await segnaStato(i.message, `✅ Approvata da <@${i.user.id}>`, '#2ecc71');
    const dm = await avvisa(i.guild, r, `✅ La tua richiesta (${cosa}) **${r.nome}** su **VICE LIFE RP 🌴** è stata **approvata**! 🎉`);
    // annuncio pubblico nel canale del pannello, con il tag di tutti i membri
    const pubblico = await i.guild.channels.fetch(d.canale).catch(() => null);
    await pubblico?.send({ content: `✅ ${emoji} **${r.nome}** è stata **approvata**! Complimenti a ${r.membri.map((u) => `<@${u}>`).join(' ')} 🎉`, allowedMentions: { users: r.membri } }).catch(() => {});
    return i.reply({ content: `✅ Richiesta approvata.${dm ? ' 📩 Richiedente avvisato in privato.' : ' ⚠️ DM chiusi.'}`, flags: EPH });
  }
  if (a === P && b === 'no') {
    return i.showModal(new ModalBuilder().setCustomId(`${P}m:no:${rid}`).setTitle('❌ Rifiuta richiesta').addComponents(
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('motivo').setLabel('Motivo').setStyle(TextInputStyle.Paragraph).setMaxLength(1000).setRequired(true)),
    ));
  }
  if (a === `${P}m` && b === 'no') {
    const motivo = i.fields.getTextInputValue('motivo').trim();
    r.stato = 'no'; r.staff = i.user.id; save();
    if (i.message) await segnaStato(i.message, `❌ Rifiutata da <@${i.user.id}>\n📝 ${motivo}`, '#e74c3c');
    const dm = await avvisa(i.guild, r, `❌ La tua richiesta (${cosa}) **${r.nome}** su **VICE LIFE RP 🌴** è stata **rifiutata**.\n📝 Motivo: ${motivo}\n\nPuoi correggerla e inviarne una nuova dal pannello.`);
    return i.reply({ content: `❌ Richiesta rifiutata.${dm ? ' 📩 Richiedente avvisato in privato.' : ' ⚠️ DM chiusi.'}`, flags: EPH });
  }
}

async function onReady(guild) {
  const d = get(guild.id);
  if (d.pannello || !guild.channels.cache.has(d.canale)) return;
  try { await rimettiPannello(guild); console.log(`${emoji} Pannello richieste ${cosa} pubblicato`); } catch (e) { console.warn(`[${chiave}] ${e.message}`); }
}

const re = new RegExp(`^${P}m?:`);
return {
  init(c, s) { cfg = c; save = s; },
  command: new SlashCommandBuilder().setName(comando).setDescription(`Ripubblica il pannello delle richieste ${cosa}`)
    .addChannelOption((x) => x.setName('canale').setDescription('In quale canale (vuoto = canale predefinito)'))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild).setDMPermission(false).toJSON(),
  is: (i) => (i.isChatInputCommand() && i.commandName === comando) || re.test(i.customId ?? ''),
  handle, onReady,
  _pannello: pannello, _modal: modalRichiesta, _get: get,
};
}

// ---------- RICHIESTE ATTIVITÀ (minimo 5 player) ----------
const attivita = creaRichieste({
  chiave: 'attivita', P: 'att', CANALE: '1575154048309526598', MINIMO: 5, comando: 'attivita',
  cosa: 'attività', emoji: '🏪', pulsante: 'Richiedi un\'attività',
  titolo: '🏪 RICHIESTA ATTIVITÀ – VICE LIFE RP 🌴',
  spiegazione: 'Vuoi aprire un\'**attività** in città? (locale, negozio, officina, azienda...)',
  campoNome: 'Nome dell\'attività', nomePlaceholder: 'Es. Vice Burger',
  campoTipo: 'Tipo di attività', tipoPlaceholder: 'Es. Ristorante, officina, negozio, night club...',
  descrPlaceholder: 'Cosa fa l\'attività, dove si trova, orari, ruoli dei membri...',
});

// ---------- RICHIESTE FAZIONI (minimo 7 player) ----------
const fazioni = creaRichieste({
  chiave: 'richiesteFazioni', P: 'faz', CANALE: '1575154070694658149', MINIMO: 7, comando: 'fazioni',
  cosa: 'fazione', emoji: '⚔️', pulsante: 'Richiedi una fazione',
  titolo: '⚔️ RICHIESTA FAZIONE – VICE LIFE RP 🌴',
  spiegazione: 'Vuoi creare una **fazione** in città? (legale o illegale: gang, famiglia, organizzazione, corpo di polizia...)\nPrima leggi bene il **regolamento delle fazioni**!',
  campoNome: 'Nome della fazione', nomePlaceholder: 'Es. Los Vagos',
  campoTipo: 'Tipo di fazione (legale o illegale)', tipoPlaceholder: 'Es. Illegale – gang di quartiere',
  descrPlaceholder: 'Storia della fazione, obiettivi, territorio, gerarchia, capo e vice...',
});

module.exports = { creaRichieste, attivita, fazioni };
