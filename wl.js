// ================================================
//   VICE LIFE🌴  -  INFO WHITELIST CONOSCITIVA
//   Il bot pubblica da solo nel canale WL un messaggio con tutte le
//   informazioni per superare la whitelist. Con /wl-info lo modifichi.
// ================================================
const path = require('path');
const {
  ChannelType, PermissionFlagsBits, MessageFlags, EmbedBuilder, SlashCommandBuilder, AttachmentBuilder,
  ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, ChannelSelectMenuBuilder,
  ModalBuilder, TextInputBuilder, TextInputStyle,
} = require('discord.js');

const EPH = MessageFlags.Ephemeral;
const CANALE_WL = '1575150437580148826';
const ROSA = '#ff2d95';
let cfg; let save;

const SEZIONI_DEFAULT = [
  {
    titolo: '🌴 WHITELIST CONOSCITIVA – VICE LIFE RP',
    testo: 'Per entrare in città devi superare la **whitelist conoscitiva**: un breve colloquio vocale con lo staff per capire se conosci le basi del **Roleplay** e il **regolamento** di VICE LIFE RP.\n\nNon è un esame difficile: vogliamo solo assicurarci che tutti giochino in modo serio e divertente. Leggi bene questo messaggio e sarai pronto! 💪',
  },
  {
    titolo: '✅ Requisiti',
    testo: '• Aver letto **tutto il regolamento** del server\n• Un **microfono funzionante** e un posto tranquillo\n• Avere l\'**età minima** richiesta dal regolamento\n• Essere presente in Discord all\'orario del colloquio\n• Rispetto e serietà verso lo staff',
  },
  {
    titolo: '📝 Come si svolge',
    testo: '1️⃣ Leggi il regolamento e questa guida\n2️⃣ Apri un **ticket** o entra nella **sala d\'attesa WL** quando lo staff è disponibile\n3️⃣ Uno staffer ti farà alcune **domande sul Roleplay** e qualche **situazione da risolvere** come se fossi in gioco\n4️⃣ Ti chiederemo anche una piccola **storia del tuo personaggio** (nome, età, da dove viene, cosa vuole fare in città)\n5️⃣ Se superi la WL ricevi il ruolo e puoi entrare in città 🎉\n\nSe non la superi niente paura: potrai riprovare più avanti.',
  },
  {
    titolo: '📚 Termini RP da conoscere',
    testo: '**IC / OOC** – In Character (dentro il personaggio) / Out Of Character (fuori dal gioco)\n**Metagaming** – usare in gioco informazioni ottenute fuori dal gioco (Discord, live, amici)\n**Powergaming** – fare azioni impossibili nella realtà o forzare l\'altro senza dargli possibilità di reagire\n**RDM** – Random Deathmatch: uccidere qualcuno senza un motivo RP valido\n**VDM** – Vehicle Deathmatch: usare un veicolo come arma senza motivo RP\n**Fear RP** – avere paura per la propria vita quando si è minacciati (es. con un\'arma puntata)\n**NLR** – New Life Rule: dopo la morte dimentichi gli eventi che l\'hanno causata\n**Valore della vita** – il tuo personaggio tiene alla sua vita e non fa gesti suicidi\n**Combat Log** – uscire dal gioco per evitare una situazione RP\n**Cop baiting** – provocare la polizia senza motivo solo per farsi inseguire',
  },
  {
    titolo: '💡 Consigli per superarla',
    testo: '• Rispondi con **parole tue**, non a memoria\n• Pensa sempre a **come reagirebbe una persona vera**\n• Prepara bene la **storia del personaggio**\n• Resta calmo: se non sai una risposta, ragiona ad alta voce\n• Sii puntuale e rispettoso con lo staff\n\nBuona fortuna e benvenuto a **VICE LIFE RP 🌴**!',
  },
];

function get(gid) {
  const w = (cfg(gid).wl ??= { canale: CANALE_WL, sezioni: structuredClone(SEZIONI_DEFAULT), pubblicato: null });
  w.sezioni.forEach((x, n) => { x.id ??= `s${n}${Date.now().toString(36)}`; });
  return w;
}
const nuovoId = () => Date.now().toString(36);

function messaggio(guild, w) {
  const banner = new EmbedBuilder().setColor(ROSA).setImage('attachment://banner-vicelife.jpg');
  const sezioni = w.sezioni.slice(0, 9).map((x, n) => {
    const e = new EmbedBuilder().setColor(ROSA).setDescription((x.testo || '​').slice(0, 4096));
    if (x.titolo) e.setTitle(x.titolo.slice(0, 256));
    if (n === w.sezioni.length - 1) e.setFooter({ text: 'VICE LIFE RP 🌴 • Whitelist', iconURL: guild.iconURL() ?? undefined }).setTimestamp();
    return e;
  });
  return {
    embeds: [banner, ...sezioni],
    files: [new AttachmentBuilder(path.join(__dirname, 'banner-vicelife.jpg'), { name: 'banner-vicelife.jpg' })],
    attachments: [],
  };
}

const lunghezza = (w) => w.sezioni.reduce((t, x) => t + (x.titolo?.length ?? 0) + (x.testo?.length ?? 0), 0) + 40;

async function pubblica(guild, canaleId) {
  const w = get(guild.id);
  const ch = await guild.channels.fetch(canaleId);
  const msg = await ch.send(messaggio(guild, w));
  if (w.pubblicato) {
    const old = await guild.channels.fetch(w.pubblicato.canale).catch(() => null);
    await old?.messages.delete(w.pubblicato.messaggio).catch(() => {});
  }
  w.pubblicato = { canale: ch.id, messaggio: msg.id };
  w.canale = ch.id;
  save();
}

async function aggiorna(guild) {
  const w = get(guild.id);
  if (!w.pubblicato) return false;
  try {
    const ch = await guild.channels.fetch(w.pubblicato.canale);
    const msg = await ch.messages.fetch(w.pubblicato.messaggio);
    await msg.edit(messaggio(guild, w));
    return true;
  } catch { return false; }
}

function pannello(guild, avviso = '') {
  const w = get(guild.id);
  const elenco = w.sezioni.map((x, n) => `${n + 1}. ${x.titolo || '*(senza titolo)*'}`).join('\n');
  const rows = [];
  if (w.sezioni.length) {
    rows.push(new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('wl:modifica')
      .setPlaceholder('✏️ Modifica una sezione').addOptions(w.sezioni.map((x, n) => ({ label: `${n + 1}. ${x.titolo || 'senza titolo'}`.slice(0, 100), value: x.id })))));
    rows.push(new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('wl:elimina')
      .setPlaceholder('🗑️ Elimina una sezione').addOptions(w.sezioni.map((x, n) => ({ label: `Elimina: ${n + 1}. ${x.titolo || 'senza titolo'}`.slice(0, 100), value: x.id })))));
  }
  rows.push(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('wl:aggiungi').setLabel('Aggiungi sezione').setEmoji('➕').setStyle(ButtonStyle.Success).setDisabled(w.sezioni.length >= 9),
      new ButtonBuilder().setCustomId('wl:ripristina').setLabel('Ripristina testi originali').setEmoji('🔄').setStyle(ButtonStyle.Secondary),
    ),
    new ActionRowBuilder().addComponents(new ChannelSelectMenuBuilder().setCustomId('wl:pubblica')
      .setPlaceholder('📢 Sposta / ripubblica in un altro canale...').addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)),
  );
  const pieno = lunghezza(w) > 6000 ? '\n⚠️ Testo troppo lungo (max 6000 caratteri in tutto): accorcia qualche sezione.' : '';
  return {
    content: (
      `## 📋 Info Whitelist – VICE LIFE🌴\n` +
      `${w.pubblicato ? `📌 Pubblicato in <#${w.pubblicato.canale}> (si aggiorna da solo)` : `📌 *Non ancora pubblicato*`}\n` +
      `✍️ Caratteri usati: **${lunghezza(w)}/6000**${pieno}\n\n**Sezioni:**\n${elenco}` +
      (avviso ? `\n\n${avviso}` : '')
    ).slice(0, 2000),
    embeds: [], files: [], attachments: [],
    components: rows,
  };
}

const modalSezione = (x) => new ModalBuilder().setCustomId(x ? `wlm:sez:${x.id}` : 'wlm:sez').setTitle(x ? '✏️ Modifica sezione' : '➕ Nuova sezione').addComponents(
  new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('titolo').setLabel('Titolo').setStyle(TextInputStyle.Short)
    .setMaxLength(256).setRequired(false).setValue(x?.titolo ?? '')),
  new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('testo').setLabel('Testo (puoi andare a capo)').setStyle(TextInputStyle.Paragraph)
    .setMaxLength(4000).setRequired(true).setValue(x?.testo ?? '')),
);

async function handle(i) {
  if (i.isChatInputCommand()) return i.reply({ ...pannello(i.guild), flags: EPH });
  if (!i.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) return i.reply({ content: '❌ Non hai i permessi.', flags: EPH });
  const g = i.guild; const w = get(g.id);
  const [a, b, id] = i.customId.split(':');
  const fatto = async (avviso) => {
    save();
    if (lunghezza(w) > 6000) return i.update(pannello(g, `${avviso}\n⚠️ Non aggiorno il messaggio: il testo supera 6000 caratteri.`));
    const ok = w.pubblicato ? await aggiorna(g) : true;
    return i.update(pannello(g, ok ? avviso : `${avviso}\n⚠️ Non trovo più il messaggio: ripubblicalo dal menu 📢.`));
  };
  if (a === 'wl') {
    if (b === 'modifica') { const x = w.sezioni.find((y) => y.id === i.values[0]); return x ? i.showModal(modalSezione(x)) : i.update(pannello(g)); }
    if (b === 'aggiungi') return i.showModal(modalSezione(null));
    if (b === 'elimina') { w.sezioni = w.sezioni.filter((y) => y.id !== i.values[0]); return fatto('🗑️ Sezione eliminata.'); }
    if (b === 'ripristina') { w.sezioni = SEZIONI_DEFAULT.map((x) => ({ id: nuovoId() + Math.random().toString(36).slice(2, 5), ...x })); return fatto('🔄 Testi originali ripristinati.'); }
    if (b === 'pubblica') {
      try { await pubblica(g, i.values[0]); return i.update(pannello(g, `✅ Pubblicato in <#${i.values[0]}>.`)); } catch (e) { return i.update(pannello(g, `❌ Non posso scrivere in <#${i.values[0]}>: ${e.message}`)); }
    }
  }
  if (a === 'wlm' && b === 'sez') {
    const dati = { titolo: i.fields.getTextInputValue('titolo').trim(), testo: i.fields.getTextInputValue('testo').trim() };
    if (id) Object.assign(w.sezioni.find((y) => y.id === id) ?? {}, dati);
    else w.sezioni.push({ id: nuovoId(), ...dati });
    return fatto('✅ Sezione salvata.');
  }
}

// All'avvio: se non è ancora pubblicato lo pubblica nel canale WL, altrimenti lo aggiorna
async function onReady(guild) {
  const w = get(guild.id);
  if (w.pubblicato) return aggiorna(guild);
  if (!guild.channels.cache.has(w.canale)) return null;
  try {
    await pubblica(guild, w.canale);
    console.log(`📋 Info whitelist pubblicate in #${guild.channels.cache.get(w.canale)?.name}`);
  } catch (e) { console.warn(`[wl] ${e.message}`); }
  return null;
}

module.exports = {
  init(cfgFn, saveFn) { cfg = cfgFn; save = saveFn; },
  command: new SlashCommandBuilder().setName('wl-info').setDescription('Modifica il messaggio con le informazioni per la whitelist conoscitiva')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild).setDMPermission(false).toJSON(),
  isWl: (i) => (i.isChatInputCommand() && i.commandName === 'wl-info') || /^wlm?:/.test(i.customId ?? ''),
  handle, onReady,
  _pannello: pannello, _messaggio: messaggio, _get: get, _lunghezza: lunghezza,
};
