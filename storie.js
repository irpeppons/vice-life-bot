// ================================================
//   VICE LIFE🌴  -  STORIE DEI PERSONAGGI
//   Pannello nel canale storie: il player preme il pulsante, scrive la
//   storia del suo personaggio e la storia viene pubblicata nel canale.
//   Solo gli esaminatori (2 ruoli) possono accettarla o rifiutarla.
// ================================================
const path = require('path');
const {
  MessageFlags, EmbedBuilder, SlashCommandBuilder, AttachmentBuilder, PermissionFlagsBits,
  ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle,
} = require('discord.js');

const EPH = MessageFlags.Ephemeral;
const CANALE_STORIE = '1575150502285410334';
const ESAMINATORI = ['1575144400399499304', '1575144537926672455'];
const ROSA = '#ff2d95';
const BANNER = 'banner-vicelife.jpg';
let cfg; let save;

const get = (gid) => (cfg(gid).storie ??= { canale: CANALE_STORIE, pannello: null, utenti: {} });
const esaminatore = (member) => ESAMINATORI.some((r) => member?.roles?.cache?.has(r));

function pannello(guild) {
  const e = new EmbedBuilder().setColor(ROSA).setTitle('📖 STORIA DEL PERSONAGGIO – VICE LIFE RP 🌴')
    .setDescription(
      'Prima di entrare in città devi creare la **storia del tuo personaggio**.\n\n' +
      'Premi il pulsante qui sotto e compila il modulo con:\n' +
      '• **Nome e cognome** del personaggio\n• **Età** del personaggio\n• **Da dove viene**\n' +
      '• La sua **storia** (passato, carattere, famiglia...)\n• **Cosa vuole fare** in città\n\n' +
      '📌 La storia deve essere **accettata dallo staff**: riceverai la risposta in privato.\n' +
      '✍️ Scrivi una storia **realistica** e con parole tue!',
    )
    .setImage(`attachment://${BANNER}`)
    .setFooter({ text: 'VICE LIFE RP 🌴 • Storie dei personaggi', iconURL: guild.iconURL() ?? undefined });
  return {
    embeds: [e],
    files: [new AttachmentBuilder(path.join(__dirname, BANNER), { name: BANNER })],
    attachments: [],
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('sto:scrivi').setLabel('Scrivi la storia del personaggio').setEmoji('📖').setStyle(ButtonStyle.Success),
    )],
  };
}

// Pubblica il pannello in fondo al canale (cancella quello vecchio), così è sempre l'ultimo messaggio
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

const campo = (id, label, { style = TextInputStyle.Short, max = 100, min = 0, placeholder, required = true } = {}) => {
  const t = new TextInputBuilder().setCustomId(id).setLabel(label).setStyle(style).setRequired(required).setMaxLength(max);
  if (min) t.setMinLength(min);
  if (placeholder) t.setPlaceholder(placeholder);
  return new ActionRowBuilder().addComponents(t);
};
const modalStoria = () => new ModalBuilder().setCustomId('stom:invia').setTitle('📖 Storia del personaggio').addComponents(
  campo('nome', 'Nome e cognome del personaggio', { max: 60, placeholder: 'Es. Tony Montana' }),
  campo('eta', 'Età del personaggio', { max: 3, placeholder: 'Es. 28' }),
  campo('origine', 'Da dove viene', { max: 100, placeholder: 'Es. Nato a Cuba, cresciuto a Miami' }),
  campo('storia', 'La storia del tuo personaggio', { style: TextInputStyle.Paragraph, max: 3500, min: 200, placeholder: 'Racconta il suo passato, la famiglia, il carattere, perché arriva a Vice City...' }),
  campo('obiettivi', 'Cosa vuole fare in città?', { style: TextInputStyle.Paragraph, max: 800, placeholder: 'Es. aprire un\'attività, entrare in polizia, fare soldi...' }),
);

const bottoni = (uid, fine = false) => new ActionRowBuilder().addComponents(
  new ButtonBuilder().setCustomId(`sto:ok:${uid}`).setLabel('Accetta').setEmoji('✅').setStyle(ButtonStyle.Success).setDisabled(fine),
  new ButtonBuilder().setCustomId(`sto:no:${uid}`).setLabel('Rifiuta').setEmoji('❌').setStyle(ButtonStyle.Danger).setDisabled(fine),
);

async function inviaStoria(i) {
  const g = i.guild; const d = get(g.id);
  const v = (k) => i.fields.getTextInputValue(k).trim();
  const eta = parseInt(v('eta'), 10);
  if (!(eta >= 1 && eta <= 120)) return i.reply({ content: '❌ Età del personaggio non valida: scrivi solo il numero, per esempio `28`.', flags: EPH });
  const u = d.utenti[i.user.id];
  if (u?.stato === 'attesa') return i.reply({ content: '⏳ Hai già una storia in attesa: aspetta la risposta dello staff.', flags: EPH });
  if (u?.stato === 'ok') return i.reply({ content: '✅ La tua storia è già stata accettata!', flags: EPH });
  await i.deferReply({ flags: EPH });

  const e = new EmbedBuilder().setColor('#f1c40f').setTitle(`📖 ${v('nome')}`.slice(0, 256))
    .setAuthor({ name: `Storia di ${i.user.username}`, iconURL: i.user.displayAvatarURL() })
    .setDescription(v('storia').slice(0, 4096))
    .addFields(
      { name: '🎂 Età', value: String(eta), inline: true },
      { name: '🌍 Da dove viene', value: v('origine').slice(0, 1024), inline: true },
      { name: '🎯 Cosa vuole fare in città', value: v('obiettivi').slice(0, 1024) },
      { name: '📌 Stato', value: '⏳ In attesa di un esaminatore' },
    )
    .setFooter({ text: 'VICE LIFE RP 🌴 • Storie dei personaggi' }).setTimestamp();
  const ch = await g.channels.fetch(d.canale).catch(() => null) ?? i.channel;
  const msg = await ch.send({ content: `<@${i.user.id}>`, embeds: [e], components: [bottoni(i.user.id)], allowedMentions: { parse: [] } });
  d.utenti[i.user.id] = { stato: 'attesa', messaggio: msg.id, canale: ch.id, personaggio: v('nome'), data: Date.now() };
  save();
  await rimettiPannello(g, ch.id).catch(() => {}); // il pannello torna in fondo
  return i.editReply(`✅ Storia inviata! Uno degli esaminatori la leggerà e riceverai la risposta in privato. ${msg.url}`);
}

async function segnaStato(msg, testo, colore) {
  const e = EmbedBuilder.from(msg.embeds[0]).setColor(colore);
  e.setFields((e.data.fields ?? []).map((f) => (f.name === '📌 Stato' ? { ...f, value: testo } : f)));
  await msg.edit({ embeds: [e], components: [bottoni('x', true)] });
}

async function decidi(i) {
  const [, azione, uid] = i.customId.split(':');
  if (!esaminatore(i.member)) return i.reply({ content: '❌ Solo gli esaminatori possono accettare o rifiutare le storie.', flags: EPH });
  const d = get(i.guild.id);
  if (azione === 'ok') {
    await segnaStato(i.message, `✅ Accettata da <@${i.user.id}>`, '#2ecc71');
    d.utenti[uid] = { ...(d.utenti[uid] ?? {}), stato: 'ok', staff: i.user.id };
    save();
    const player = await i.client.users.fetch(uid).catch(() => null);
    const dm = await player?.send(`✅ La storia del tuo personaggio **${d.utenti[uid].personaggio ?? ''}** su **VICE LIFE RP 🌴** è stata **accettata**! 🎉`).then(() => true).catch(() => false);
    return i.reply({ content: `✅ Storia di <@${uid}> accettata.${dm ? ' 📩 Avvisato in privato.' : ' ⚠️ DM chiusi: avvisalo tu.'}`, flags: EPH });
  }
  if (azione === 'no') {
    return i.showModal(new ModalBuilder().setCustomId(`stom:no:${uid}`).setTitle('❌ Rifiuta storia').addComponents(
      campo('motivo', 'Cosa deve correggere?', { style: TextInputStyle.Paragraph, max: 1000, placeholder: 'Es. Storia troppo corta, aggiungi più dettagli sul passato' }),
    ));
  }
}

async function rifiuta(i) {
  const [, , uid] = i.customId.split(':');
  if (!esaminatore(i.member)) return i.reply({ content: '❌ Solo gli esaminatori possono farlo.', flags: EPH });
  const d = get(i.guild.id);
  const motivo = i.fields.getTextInputValue('motivo').trim();
  if (i.message) await segnaStato(i.message, `❌ Rifiutata da <@${i.user.id}>\n📝 ${motivo}`, '#e74c3c');
  d.utenti[uid] = { ...(d.utenti[uid] ?? {}), stato: 'no', staff: i.user.id };
  save();
  const player = await i.client.users.fetch(uid).catch(() => null);
  const dm = await player?.send(
    `❌ La storia del tuo personaggio su **VICE LIFE RP 🌴** è stata **rifiutata**.\n📝 **Da correggere:** ${motivo}\n\nSistemala e inviala di nuovo dal pannello delle storie! ✍️`,
  ).then(() => true).catch(() => false);
  return i.reply({ content: `❌ Storia di <@${uid}> rifiutata.${dm ? ' 📩 Avvisato in privato.' : ' ⚠️ DM chiusi: avvisalo tu.'}`, flags: EPH });
}

async function handle(i) {
  if (i.isChatInputCommand()) {
    if (!i.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) return i.reply({ content: '❌ Non hai i permessi.', flags: EPH });
    const canale = i.options.getChannel('canale')?.id ?? get(i.guild.id).canale;
    await rimettiPannello(i.guild, canale);
    return i.reply({ content: `✅ Pannello storie pubblicato in <#${canale}>.`, flags: EPH });
  }
  const id = i.customId;
  if (id === 'sto:scrivi') return i.showModal(modalStoria());
  if (id === 'stom:invia') return inviaStoria(i);
  if (id.startsWith('stom:no:')) return rifiuta(i);
  if (/^sto:(ok|no):/.test(id)) return decidi(i);
}

// All'avvio pubblica il pannello nel canale storie se non c'è ancora
async function onReady(guild) {
  const d = get(guild.id);
  if (d.pannello || !guild.channels.cache.has(d.canale)) return;
  try { await rimettiPannello(guild); console.log('📖 Pannello storie dei personaggi pubblicato'); } catch (e) { console.warn(`[storie] ${e.message}`); }
}

module.exports = {
  init(cfgFn, saveFn) { cfg = cfgFn; save = saveFn; },
  command: new SlashCommandBuilder().setName('storie-pg').setDescription('Ripubblica il pannello delle storie dei personaggi')
    .addChannelOption((o) => o.setName('canale').setDescription('In quale canale (vuoto = canale storie)'))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild).setDMPermission(false).toJSON(),
  isStoria: (i) => (i.isChatInputCommand() && i.commandName === 'storie-pg') || /^stom?:/.test(i.customId ?? ''),
  handle, onReady,
  _pannello: pannello, _modalStoria: modalStoria, _get: get,
};
