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
  ModalBuilder, TextInputBuilder, TextInputStyle,
} = require('discord.js');

const EPH = MessageFlags.Ephemeral;
const RUOLI_ESAMINATORI = ['1575144400399499304', '1575144537926672455']; // solo loro possono usarlo
const RUOLO_WL_PASSATA = '1575145424963239998';
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
        'Premi un pulsante e scrivi il **tag Discord** del player.\n\n' +
        `✅ **WL passata** → il bot gli dà <@&${RUOLO_WL_PASSATA}> e lo avvisa in privato\n` +
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
const modalPassata = () => new ModalBuilder().setCustomId('ewm:ok').setTitle('✅ WL passata').addComponents(
  campo('tag', 'Tag Discord del player', { placeholder: 'Es. ale_nox2 oppure @ale_nox2' }),
  campo('note', 'Messaggio per il player (facoltativo)', { style: TextInputStyle.Paragraph, max: 1000, required: false, placeholder: 'Es. Ottima WL, benvenuto in città!' }),
);
const modalNonSuperata = () => new ModalBuilder().setCustomId('ewm:no').setTitle('❌ WL non superata').addComponents(
  campo('tag', 'Tag Discord del player', { placeholder: 'Es. ale_nox2 oppure @ale_nox2' }),
  campo('ore', 'Fra quante ore può rifare la WL?', { max: 4, placeholder: 'Es. 24' }),
  campo('motivo', 'Motivo (facoltativo)', { style: TextInputStyle.Paragraph, max: 1000, required: false, placeholder: 'Es. Ripassa i termini RP: metagaming e powergaming' }),
);

async function registraEsito(i, esito) {
  const g = i.guild; const d = get(g.id);
  const v = (k) => i.fields.getTextInputValue(k).trim();
  await i.deferReply({ flags: EPH });
  const trovato = await trovaPlayer(g, v('tag'));
  if (!trovato) return i.editReply(`❌ Non trovo nessun player con il tag **${v('tag')}** nel server. Controlla di averlo scritto giusto.`);
  if (trovato.multipli) {
    return i.editReply(`⚠️ Ho trovato più player con quel nome, scrivi il tag esatto o l'ID:\n${trovato.multipli.map((m) => `• ${m.user.username} (${m.displayName}) – \`${m.id}\``).join('\n')}`);
  }
  const player = trovato;

  if (esito === 'ok') {
    let ruolo = '✅ Ruolo dato';
    await player.roles.add(RUOLO_WL_PASSATA, `WL passata, esaminato da ${i.user.username}`)
      .catch((e) => { ruolo = `⚠️ Non sono riuscito a dare il ruolo: ${e.message}`; });
    const note = v('note');
    const dm = await player.send(
      `🎉 **Complimenti!** Hai **superato la whitelist** di **VICE LIFE RP 🌴**!\nOra sei un cittadino: benvenuto in città! 🏙️${note ? `\n\n💬 ${note}` : ''}`,
    ).then(() => true).catch(() => false);
    d.utenti[player.id] = { esito: 'ok', data: Date.now(), staff: i.user.id };
    d.storico.push({ player: player.id, esito: 'ok', staff: i.user.id, data: Date.now() });
    d.storico = d.storico.slice(-50);
    save();
    await aggiornaPannelloFisso(g);
    return i.editReply(`✅ **${player.user.username}** ha passato la WL!\n${ruolo} <@&${RUOLO_WL_PASSATA}>\n${dm ? '📩 Avvisato in privato.' : '⚠️ Non riesco a scrivergli in privato (DM chiusi).'}`);
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
  return i.editReply(`❌ **${player.user.username}** non ha superato la WL. Potrà riprovare tra **${ore} ore** (<t:${Math.floor(quando / 1000)}:R>).\n${dm ? '📩 Avvisato in privato.' : '⚠️ Non riesco a scrivergli in privato (DM chiusi): avvisalo tu.'}`);
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
  _pannello: pannello, _pannelloComando: pannelloComando, _trovaPlayer: trovaPlayer, _modals: () => [modalPassata(), modalNonSuperata()],
};
