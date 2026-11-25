// ================================================
//   VICE LIFE🌴  -  ESITO WHITELIST
//   /esito-wl -> pannello (solo per 2 ruoli staff) per segnare se un
//   player ha PASSATO o NON SUPERATO la WL conoscitiva.
//   ✅ Passata  -> il bot gli dà il ruolo cittadino e lo avvisa in privato
//   ❌ Non superata -> il bot gli scrive in privato fra quante ore può riprovare
// ================================================
const {
  ChannelType, MessageFlags, EmbedBuilder, SlashCommandBuilder,
  ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelSelectMenuBuilder,
  ModalBuilder, TextInputBuilder, TextInputStyle, LabelBuilder, UserSelectMenuBuilder,
} = require('discord.js');

const EPH = MessageFlags.Ephemeral;
const RUOLI_ESAMINATORI = ['1575144400399499304', '1575144537926672455']; // solo loro possono usarlo
const RUOLO_WL_PASSATA = '1575145424963239998';
const RUOLI_WL_PASSATA = ['1575145424963239998', '1575145370600611870']; // dati quando passa la WL
const RUOLO_DA_TOGLIERE = '1575145467061477586'; // tolto quando passa la WL (in attesa whitelist)
const ROSA = '#ff2d95';
let cfg; let save;

const get = (gid) => (cfg(gid).esitiwl ??= { utenti: {}, pannello: null, storico: [] });
const puoUsare = (member) => RUOLI_ESAMINATORI.some((r) => member?.roles?.cache?.has(r));

// Trova il player dal testo scritto: @menzione, ID, nome utente, nome visualizzato o nickname
async function trovaPlayer(guild, testo) {
  const t = testo.trim().replace(/^@/, '');
  const id = t.match(/^<@!?(\d+)>$/)?.[1] ?? (/^\d{17,20}$/.test(t) ? t : null);
  if (id) return guild.members.fetch(id).catch(() => null);
  const q = t.toLowerCase();
  const pulito = (s) => (s ?? '').toLowerCase().replace(/\s*[[(|#].*$/, '').trim(); // toglie " [0002]" ecc.
  const tutti = [...guild.members.cache.values()].filter((m) => !m.user.bot);
  const esatti = tutti.filter((m) => [m.user.username, m.user.globalName, m.nickname, m.displayName]
    .some((n) => n && (n.toLowerCase() === q || pulito(n) === q)));
  if (esatti.length === 1) return esatti[0];
  if (esatti.length > 1) return { multipli: esatti };
  const cercati = await guild.members.search({ query: t, limit: 5 }).catch(() => null);
  const lista = [...(cercati?.values() ?? [])].filter((m) => !m.user.bot);
  if (lista.length === 1) return lista[0];
  if (lista.length > 1) return { multipli: lista };
  return null;
}

// ---------- pannello ----------
function pannello(guild, avviso = '') {
  const d = get(guild.id);
  const ultimi = d.storico.slice(-5).reverse()
    .map((x) => `${x.esito === 'ok' ? '✅' : '❌'} <@${x.player}> – da <@${x.staff}> <t:${Math.floor(x.data / 1000)}:R>${x.ore ? ` (riprova tra ${x.ore}h)` : ''}`)
    .join('\n') || '*Nessun esito ancora*';
  return {
    content: '',
    embeds: [new EmbedBuilder().setColor(ROSA).setTitle('🎓 Esito Whitelist – VICE LIFE RP 🌴')
      .setDescription(
        'Premi un pulsante e **cerca il player** nella lista (basta scrivere le prime lettere).\n\n' +
        `✅ **WL passata** → il bot gli dà ${RUOLI_WL_PASSATA.map((r) => `<@&${r}>`).join(' ')}, toglie <@&${RUOLO_DA_TOGLIERE}> e lo avvisa in privato\n` +
        '❌ **WL non superata** → scrivi **fra quante ore** può riprovarla e il bot glielo dice in privato\n\n' +
        `**Ultimi esiti:**\n${ultimi}` + (avviso ? `\n\n${avviso}` : ''),
      )
      .setFooter({ text: 'Solo gli esaminatori WL possono usare questo pannello' })],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('ew:ok').setLabel('WL passata').setEmoji('✅').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('ew:no').setLabel('WL non superata').setEmoji('❌').setStyle(ButtonStyle.Danger),
      ),
    ],
  };
}

function pannelloComando(guild, avviso = '') {
  const p = pannello(guild, avviso);
  const d = get(guild.id);
  p.content = d.pannello ? `📌 Pannello fisso in <#${d.pannello.canale}>` : '📌 Puoi anche lasciare questo pannello fisso in un canale staff (menu qui sotto).';
  p.components.push(new ActionRowBuilder().addComponents(new ChannelSelectMenuBuilder().setCustomId('ew:pubblica')
    .setPlaceholder('📢 Lascia il pannello fisso in un canale staff...').addChannelTypes(ChannelType.GuildText)));
  return p;
}

async function aggiornaPannelloFisso(guild) {
  const d = get(guild.id);
  if (!d.pannello) return;
  const ch = await guild.channels.fetch(d.pannello.canale).catch(() => null);
  const msg = await ch?.messages.fetch(d.pannello.messaggio).catch(() => null);
  await msg?.edit(pannello(guild)).catch(() => {});
}

// ---------- moduli ----------
const campo = (id, label, { style = TextInputStyle.Short, max = 100, placeholder, required = true } = {}) => {
  const t = new TextInputBuilder().setCustomId(id).setLabel(label).setStyle(style).setRequired(required).setMaxLength(max);
  if (placeholder) t.setPlaceholder(placeholder);
  return new ActionRowBuilder().addComponents(t);
};
// Nel modulo: selettore del player con ricerca (scrivi le prime lettere e lo scegli dalla lista)
const scegliPlayer = () => new LabelBuilder().setLabel('Player').setDescription('Scrivi le prime lettere del nome e sceglilo dalla lista')
  .setUserSelectMenuComponent(new UserSelectMenuBuilder().setCustomId('player').setPlaceholder('🔎 Cerca il player...').setMinValues(1).setMaxValues(1));
const testo = (id, label, { style = TextInputStyle.Short, max = 100, placeholder, required = true } = {}) => {
  const t = new TextInputBuilder().setCustomId(id).setStyle(style).setRequired(required).setMaxLength(max);
  if (placeholder) t.setPlaceholder(placeholder);
  return new LabelBuilder().setLabel(label).setTextInputComponent(t);
};
const modalPassata = () => new ModalBuilder().setCustomId('ewm:ok').setTitle('✅ WL passata').addLabelComponents(
  scegliPlayer(),
  testo('note', 'Messaggio per il player (facoltativo)', { style: TextInputStyle.Paragraph, max: 1000, required: false, placeholder: 'Es. Ottima WL, benvenuto in città!' }),
);
const modalNonSuperata = () => new ModalBuilder().setCustomId('ewm:no').setTitle('❌ WL non superata').addLabelComponents(
  scegliPlayer(),
  testo('ore', 'Fra quante ore può rifare la WL?', { max: 4, placeholder: 'Es. 24' }),
  testo('motivo', 'Motivo (facoltativo)', { style: TextInputStyle.Paragraph, max: 1000, required: false, placeholder: 'Es. Ripassa i termini RP: metagaming e powergaming' }),
);

// Manda l'esito come messaggio normale nel canale (lo vedono tutti quelli del canale)
async function pubblicaEsito(i, embed) {
  try {
    await i.channel.send({ embeds: [embed], allowedMentions: { parse: [] } });
    await i.deleteReply().catch(() => {});
  } catch {
    await i.editReply({ embeds: [embed] }); // se non posso scrivere nel canale, lo mostro solo a chi l'ha fatto
  }
}

async function registraEsito(i, esito) {
  const g = i.guild; const d = get(g.id);
  const v = (k) => i.fields.getTextInputValue(k).trim();
  await i.deferReply({ flags: EPH });
  const scelto = i.fields.getSelectedUsers('player')?.first();
  const player = scelto ? await g.members.fetch(scelto.id).catch(() => null) : null;
  if (!player) return i.editReply('❌ Questo player non è più nel server.');
  if (player.user.bot) return i.editReply('❌ Hai scelto un bot.');

  if (esito === 'ok') {
    const motivoLog = `WL passata, esaminato da ${i.user.username}`;
    const ruoli = [];
    const daDare = RUOLI_WL_PASSATA.filter((r) => g.roles.cache.has(r) && !player.roles.cache.has(r));
    await player.roles.add(daDare, motivoLog)
      .then(() => ruoli.push(`➕ Dati: ${RUOLI_WL_PASSATA.map((r) => `<@&${r}>`).join(' ')}`))
      .catch((e) => ruoli.push(`⚠️ Non sono riuscito a dare i ruoli: ${e.message}`));
    if (player.roles.cache.has(RUOLO_DA_TOGLIERE)) {
      await player.roles.remove(RUOLO_DA_TOGLIERE, motivoLog)
        .then(() => ruoli.push(`➖ Tolto: <@&${RUOLO_DA_TOGLIERE}>`))
        .catch((e) => ruoli.push(`⚠️ Non sono riuscito a togliere <@&${RUOLO_DA_TOGLIERE}>: ${e.message}`));
    }
    const note = v('note');
    const dm = await player.send(
      `🎉 **Complimenti!** Hai **superato la whitelist** di **VICE LIFE RP 🌴**!\nOra sei un cittadino: benvenuto in città! 🏙️${note ? `\n\n💬 ${note}` : ''}`,
    ).then(() => true).catch(() => false);
    d.utenti[player.id] = { esito: 'ok', data: Date.now(), staff: i.user.id };
    d.storico.push({ player: player.id, esito: 'ok', staff: i.user.id, data: Date.now() });
    d.storico = d.storico.slice(-50);
    save();
    await aggiornaPannelloFisso(g);
    const e = new EmbedBuilder().setColor('#2ecc71').setTitle('✅ WHITELIST PASSATA')
      .setDescription(`<@${player.id}> ha **superato la whitelist**! Benvenuto in città 🌴`)
      .addFields(
        { name: '👤 Player', value: `<@${player.id}> (${player.user.username})`, inline: true },
        { name: '🎓 Esaminatore', value: `<@${i.user.id}>`, inline: true },
        { name: '🎭 Ruoli', value: ruoli.join('\n') || 'Nessuna modifica' },
        { name: '📩 Messaggio privato', value: dm ? 'Inviato' : '⚠️ Non inviato (DM chiusi)', inline: true },
      )
      .setThumbnail(player.user.displayAvatarURL({ size: 256 })).setFooter({ text: 'VICE LIFE RP 🌴 • Esito WL' }).setTimestamp();
    if (note) e.addFields({ name: '💬 Messaggio', value: note.slice(0, 1024) });
    return pubblicaEsito(i, e);
  }

  const ore = parseInt(v('ore'), 10);
  if (!(ore >= 0 && ore <= 8760)) return i.editReply('❌ Le ore devono essere un numero, per esempio `24`.');
  const quando = Date.now() + ore * 36e5;
  const motivo = v('motivo');
  const dm = await player.send(
    `❌ Purtroppo **non hai superato la whitelist** di **VICE LIFE RP 🌴**.\n` +
    `⏰ Potrai riprovare la WL **tra ${ore} ${ore === 1 ? 'ora' : 'ore'}** (<t:${Math.floor(quando / 1000)}:f>).` +
    `${motivo ? `\n\n📝 Motivo: ${motivo}` : ''}\n\nNon mollare: ripassa il regolamento e riprova! 💪`,
  ).then(() => true).catch(() => false);
  d.utenti[player.id] = { esito: 'no', data: Date.now(), staff: i.user.id, ore, riprova: quando };
  d.storico.push({ player: player.id, esito: 'no', staff: i.user.id, data: Date.now(), ore });
  d.storico = d.storico.slice(-50);
  save();
  await aggiornaPannelloFisso(g);
  const e = new EmbedBuilder().setColor('#e74c3c').setTitle('❌ WHITELIST NON SUPERATA')
    .setDescription(`<@${player.id}> non ha superato la whitelist.`)
    .addFields(
      { name: '👤 Player', value: `<@${player.id}> (${player.user.username})`, inline: true },
      { name: '🎓 Esaminatore', value: `<@${i.user.id}>`, inline: true },
      { name: '⏰ Può riprovare', value: `tra **${ore} ${ore === 1 ? 'ora' : 'ore'}** (<t:${Math.floor(quando / 1000)}:f>)` },
      { name: '📩 Messaggio privato', value: dm ? 'Inviato' : '⚠️ Non inviato (DM chiusi): avvisalo tu', inline: true },
    )
    .setThumbnail(player.user.displayAvatarURL({ size: 256 })).setFooter({ text: 'VICE LIFE RP 🌴 • Esito WL' }).setTimestamp();
  if (motivo) e.addFields({ name: '📝 Motivo', value: motivo.slice(0, 1024) });
  return pubblicaEsito(i, e);
}

async function handle(i) {
  if (!puoUsare(i.member)) return i.reply({ content: '❌ Solo gli esaminatori WL possono usare questo pannello.', flags: EPH });
  if (i.isChatInputCommand()) return i.reply({ ...pannelloComando(i.guild), flags: EPH });
  const id = i.customId;
  if (id === 'ew:ok') return i.showModal(modalPassata());
  if (id === 'ew:no') return i.showModal(modalNonSuperata());
  if (id === 'ewm:ok') return registraEsito(i, 'ok');
  if (id === 'ewm:no') return registraEsito(i, 'no');
  if (id === 'ew:pubblica') {
    const d = get(i.guild.id);
    const ch = i.guild.channels.cache.get(i.values[0]);
    try {
      const msg = await ch.send(pannello(i.guild));
      if (d.pannello) {
        const old = await i.guild.channels.fetch(d.pannello.canale).catch(() => null);
        await old?.messages.delete(d.pannello.messaggio).catch(() => {});
      }
      d.pannello = { canale: ch.id, messaggio: msg.id };
      save();
      return i.update(pannelloComando(i.guild, `✅ Pannello fisso pubblicato in <#${ch.id}>.`));
    } catch (e) { return i.update(pannelloComando(i.guild, `❌ Non posso scrivere in <#${ch.id}>: ${e.message}`)); }
  }
}

// Usato dalle richieste WL: se il player deve ancora aspettare, restituisce quando potrà riprovare
const attesaRiprova = (gid, userId) => {
  const u = cfg(gid).esitiwl?.utenti?.[userId];
  return u?.esito === 'no' && u.riprova > Date.now() ? u.riprova : null;
};

module.exports = {
  init(cfgFn, saveFn) { cfg = cfgFn; save = saveFn; },
  command: new SlashCommandBuilder().setName('esito-wl').setDescription('Segna se un player ha passato o no la WL conoscitiva (solo esaminatori)')
    .setDMPermission(false).toJSON(),
  isEsito: (i) => (i.isChatInputCommand() && i.commandName === 'esito-wl') || /^ewm?:/.test(i.customId ?? ''),
  handle, attesaRiprova,
  onReady: (guild) => aggiornaPannelloFisso(guild), // aggiorna il pannello fisso all'avvio
  _pannello: pannello, _pannelloComando: pannelloComando, _trovaPlayer: trovaPlayer, _modals: () => [modalPassata(), modalNonSuperata()],
};
