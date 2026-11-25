// ================================================
//   VICE LIFE🌴  -  STATO SERVER
//   /stato-server -> pannello per dire ai player se il server di gioco è
//   🟢 online, 🔴 offline o 🟠 in manutenzione (lo decidi tu a mano).
//   Il messaggio pubblicato resta sempre in chat e si aggiorna da solo.
// ================================================
const path = require('path');
const {
  ChannelType, PermissionFlagsBits, MessageFlags, EmbedBuilder, SlashCommandBuilder, AttachmentBuilder,
  ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelSelectMenuBuilder,
  ModalBuilder, TextInputBuilder, TextInputStyle,
} = require('discord.js');

const EPH = MessageFlags.Ephemeral;
const RUOLO_PING = '1575145370600611870'; // taggato nel messaggio dello stato
let cfg; let save;

const STATI = {
  online: { emoji: '🟢', nome: 'ONLINE', colore: '#2ecc71', stile: ButtonStyle.Success },
  offline: { emoji: '🔴', nome: 'OFFLINE', colore: '#e74c3c', stile: ButtonStyle.Danger },
  manutenzione: { emoji: '🟠', nome: 'IN MANUTENZIONE', colore: '#f39c12', stile: ButtonStyle.Primary },
};
const BANNERS = { vicelife: 'banner-vicelife.jpg', discord: 'banner-discord.jpg', ticket: 'banner-ticket.jpg' };

const DEFAULT = {
  stato: 'offline',
  testi: {
    online: 'Il server è **aperto**! Entra in città e buon RP 🌴',
    offline: 'Il server è **chiuso** al momento.\nSegui gli annunci per sapere quando apre!',
    manutenzione: 'Stiamo lavorando al server per migliorarlo 🛠️\nTorniamo il prima possibile!',
  },
  info: '',
  immagine: 'vicelife',
  avvisi: true,
  ruolo: null,
  cambiato: null,
  pubblicato: null,
};
const get = (gid) => {
  const s = (cfg(gid).stato ??= structuredClone(DEFAULT));
  s.testi ??= { ...DEFAULT.testi };
  return s;
};
const isUrl = (x) => /^https?:\/\/\S+$/i.test(x);

function messaggioStato(guild, s) {
  const st = STATI[s.stato];
  const e = new EmbedBuilder().setColor(st.colore).setTitle(`${st.emoji} SERVER ${st.nome}`)
    .setDescription(`${s.testi[s.stato] || '​'}${s.info ? `\n\n🎮 **Come entrare:**\n${s.info}` : ''}`.slice(0, 4096))
    .setFooter({ text: 'VICE LIFE RP 🌴 • Stato del server', iconURL: guild.iconURL() ?? undefined });
  if (s.cambiato) e.addFields({ name: '🕒 Ultimo aggiornamento', value: `<t:${Math.floor(s.cambiato / 1000)}:R>` });
  if (guild.iconURL()) e.setThumbnail(guild.iconURL({ size: 256 }));
  const files = [];
  const file = BANNERS[(s.immagine || '').toLowerCase()];
  if (file) { e.setImage(`attachment://${file}`); files.push(new AttachmentBuilder(path.join(__dirname, file), { name: file })); }
  else if (isUrl(s.immagine)) e.setImage(s.immagine);
  return { content: `<@&${RUOLO_PING}>`, embeds: [e], files, attachments: [], allowedMentions: { roles: [RUOLO_PING] } };
}

// Ripubblica il messaggio dello stato (cancella il vecchio): così il ruolo riceve il ping
// e in chat resta sempre un solo messaggio, senza scritte in più.
async function ripubblica(guild, canaleId) {
  const s = get(guild.id);
  const ch = await guild.channels.fetch(canaleId);
  const msg = await ch.send(messaggioStato(guild, s));
  if (s.pubblicato) {
    const old = await guild.channels.fetch(s.pubblicato.canale).catch(() => null);
    await old?.messages.delete(s.pubblicato.messaggio).catch(() => {});
  }
  s.pubblicato = { canale: ch.id, messaggio: msg.id };
  save();
}

async function aggiornaPubblicato(guild) {
  const s = get(guild.id);
  if (!s.pubblicato) return true;
  try {
    const ch = await guild.channels.fetch(s.pubblicato.canale);
    const msg = await ch.messages.fetch(s.pubblicato.messaggio);
    const { allowedMentions, ...dati } = messaggioStato(guild, s);
    await msg.edit({ ...dati, components: [] });
    return true;
  } catch { return false; }
}

function pannello(guild, avviso = '') {
  const s = get(guild.id);
  const st = STATI[s.stato];
  const rows = [
    new ActionRowBuilder().addComponents(
      ...Object.entries(STATI).map(([k, x]) => new ButtonBuilder().setCustomId(`st:set:${k}`)
        .setLabel(x.nome.replace('IN ', '')).setEmoji(x.emoji).setStyle(k === s.stato ? x.stile : ButtonStyle.Secondary)),
      new ButtonBuilder().setCustomId('st:testi').setLabel('Testi & banner').setEmoji('✏️').setStyle(ButtonStyle.Secondary),
    ),
    new ActionRowBuilder().addComponents(new ChannelSelectMenuBuilder().setCustomId('st:pubblica')
      .setPlaceholder('📢 Pubblica lo stato in un canale...').addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)),
  ];
  const { content: _ping, allowedMentions: _am, ...anteprima } = messaggioStato(guild, s);
  return {
    ...anteprima,
    content: (
      `## 🖥️ Stato Server – VICE LIFE🌴\n` +
      `Stato attuale: ${st.emoji} **${st.nome}**\n` +
      `${s.pubblicato ? `📌 Pubblicato in <#${s.pubblicato.canale}> (si aggiorna da solo)` : '📌 *Non ancora pubblicato*'}\n` +
      `🔔 A ogni cambio il messaggio viene ripubblicato e tagga <@&${RUOLO_PING}>\n\n` +
      `Premi 🟢 / 🔴 / 🟠 per cambiare lo stato. 👇 **Anteprima:**` +
      (avviso ? `\n\n${avviso}` : '')
    ).slice(0, 2000),
    components: rows,
  };
}

const campo = (id, label, value, style = TextInputStyle.Short, max = 1000) => {
  const t = new TextInputBuilder().setCustomId(id).setLabel(label).setStyle(style).setRequired(false).setMaxLength(max);
  if (value) t.setValue(String(value).slice(0, max));
  return new ActionRowBuilder().addComponents(t);
};
const modalTesti = (s) => new ModalBuilder().setCustomId('stm:testi').setTitle('✏️ Testi stato server').addComponents(
  campo('online', '🟢 Testo quando è ONLINE', s.testi.online, TextInputStyle.Paragraph),
  campo('offline', '🔴 Testo quando è OFFLINE', s.testi.offline, TextInputStyle.Paragraph),
  campo('manutenzione', '🟠 Testo quando è IN MANUTENZIONE', s.testi.manutenzione, TextInputStyle.Paragraph),
  campo('info', 'Come entrare (IP, connect...) – facoltativo', s.info, TextInputStyle.Paragraph),
  campo('immagine', 'Banner: vicelife / discord / link / vuoto', s.immagine),
);

async function handle(i) {
  if (i.isChatInputCommand()) return i.reply({ ...pannello(i.guild), flags: EPH });
  if (!i.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) return i.reply({ content: '❌ Non hai i permessi.', flags: EPH });
  const g = i.guild; const s = get(g.id);
  const [a, b, c] = i.customId.split(':');
  const fatto = async (avviso) => {
    save();
    const ok = await aggiornaPubblicato(g);
    return i.update(pannello(g, ok ? avviso : `${avviso}\n⚠️ Non trovo più il messaggio pubblicato: ripubblicalo dal menu 📢.`));
  };

  if (a === 'st' && b === 'set') {
    if (s.stato === c) return i.update(pannello(g, `ℹ️ Il server è già ${STATI[c].emoji} **${STATI[c].nome}**.`));
    s.stato = c;
    s.cambiato = Date.now();
    save();
    let avviso = `✅ Stato cambiato: ${STATI[c].emoji} **${STATI[c].nome}**`;
    if (s.pubblicato) {
      try { await ripubblica(g, s.pubblicato.canale); avviso += ` • <@&${RUOLO_PING}> avvisato`; }
      catch { avviso += '\n⚠️ Non trovo il canale dello stato: ripubblicalo dal menu 📢.'; }
    } else avviso += '\n📢 Pubblicalo in un canale dal menu qui sotto.';
    return i.update(pannello(g, avviso));
  }
  if (b === 'testi' && a === 'st') return i.showModal(modalTesti(s));
  if (b === 'pubblica') {
    try {
      await ripubblica(g, i.values[0]);
      return i.update(pannello(g, `✅ Stato pubblicato in <#${i.values[0]}>! Resta lì e si aggiorna da solo.`));
    } catch (e) { return i.update(pannello(g, `❌ Non posso scrivere in <#${i.values[0]}>: ${e.message}`)); }
  }
  if (a === 'stm' && b === 'testi') {
    const v = (k) => i.fields.getTextInputValue(k).trim();
    s.testi = { online: v('online'), offline: v('offline'), manutenzione: v('manutenzione') };
    s.info = v('info');
    const img = v('immagine');
    if (!img || isUrl(img) || BANNERS[img.toLowerCase()]) s.immagine = BANNERS[img.toLowerCase()] ? img.toLowerCase() : img;
    return fatto('✅ Testi salvati.');
  }
}

module.exports = {
  init(cfgFn, saveFn) { cfg = cfgFn; save = saveFn; },
  command: new SlashCommandBuilder().setName('stato-server').setDescription('Dì ai player se il server è online, offline o in manutenzione')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild).setDMPermission(false).toJSON(),
  isStato: (i) => (i.isChatInputCommand() && i.commandName === 'stato-server') || /^stm?:/.test(i.customId ?? ''),
  handle,
  onReady: (guild) => (cfg(guild.id).stato ? aggiornaPubblicato(guild) : null),
  _pannello: pannello, _modalTesti: modalTesti, _get: get,
};
