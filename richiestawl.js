// ================================================
//   VICE LIFE🌴  -  RICHIESTA WHITELIST
//   Pannello fisso nel canale richieste: il player preme il pulsante,
//   compila tag Discord, nome reale, età e disponibilità, e si apre
//   un canale privato con lo staff (come un ticket).
//   /richiesta-wl -> pannello staff per personalizzarlo
// ================================================
const path = require('path');
const {
  ChannelType, PermissionFlagsBits, MessageFlags, EmbedBuilder, SlashCommandBuilder, AttachmentBuilder,
  ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelSelectMenuBuilder, RoleSelectMenuBuilder,
  ModalBuilder, TextInputBuilder, TextInputStyle,
} = require('discord.js');

const EPH = MessageFlags.Ephemeral;
const CANALE_RICHIESTE = '1575150460023611433';
const ROSA = '#ff2d95';
const BANNER = 'banner-vicelife.jpg';
let cfg; let save;

const DEFAULT = {
  canale: CANALE_RICHIESTE,
  titolo: '📝 RICHIESTA WHITELIST – VICE LIFE RP 🌴',
  descrizione: 'Vuoi entrare in città? Richiedi la tua **whitelist conoscitiva**!\n\nPremi il pulsante qui sotto e compila il modulo con:\n• il tuo **tag Discord**\n• il tuo **nome reale**\n• la tua **età**\n• **fino a che ora sei disponibile** per fare la WL\n\nUno staffer ti risponderà nel canale privato che si aprirà. ✅',
  pulsante: 'Richiedi Whitelist',
  categoria: null,
  ruoloAccettato: null,
  pubblicato: null,
};
const get = (gid) => (cfg(gid).richiestawl ??= structuredClone(DEFAULT));
const staffRuoli = (gid) => cfg(gid).tickets?.staff ?? [];
const slug = (s) => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'player';
const isStaff = (i) => i.memberPermissions?.has(PermissionFlagsBits.ManageChannels)
  || staffRuoli(i.guild.id).some((r) => i.member.roles.cache.has(r));
const bannerFile = () => [new AttachmentBuilder(path.join(__dirname, BANNER), { name: BANNER })];

// ---------- pannello pubblico ----------
function pannelloPubblico(guild, r) {
  const e = new EmbedBuilder().setColor(ROSA).setTitle(r.titolo.slice(0, 256)).setDescription(r.descrizione.slice(0, 4096))
    .setImage(`attachment://${BANNER}`).setFooter({ text: 'VICE LIFE RP 🌴 • Whitelist', iconURL: guild.iconURL() ?? undefined });
  if (guild.iconURL()) e.setThumbnail(guild.iconURL({ size: 256 }));
  return {
    embeds: [e], files: bannerFile(), attachments: [],
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('rw:apri').setLabel(r.pulsante.slice(0, 80)).setEmoji('📝').setStyle(ButtonStyle.Success),
    )],
  };
}

async function pubblica(guild, canaleId) {
  const r = get(guild.id);
  const ch = await guild.channels.fetch(canaleId);
  const msg = await ch.send(pannelloPubblico(guild, r));
  if (r.pubblicato) {
    const old = await guild.channels.fetch(r.pubblicato.canale).catch(() => null);
    await old?.messages.delete(r.pubblicato.messaggio).catch(() => {});
  }
  r.pubblicato = { canale: ch.id, messaggio: msg.id };
  r.canale = ch.id;
  save();
}

async function aggiorna(guild) {
  const r = get(guild.id);
  if (!r.pubblicato) return false;
  try {
    const ch = await guild.channels.fetch(r.pubblicato.canale);
    await (await ch.messages.fetch(r.pubblicato.messaggio)).edit(pannelloPubblico(guild, r));
    return true;
  } catch { return false; }
}

// ---------- modulo del player ----------
const campo = (id, label, { value, style = TextInputStyle.Short, max = 100, placeholder, required = true } = {}) => {
  const t = new TextInputBuilder().setCustomId(id).setLabel(label).setStyle(style).setRequired(required).setMaxLength(max);
  if (value) t.setValue(String(value).slice(0, max));
  if (placeholder) t.setPlaceholder(placeholder);
  return new ActionRowBuilder().addComponents(t);
};
const modalRichiesta = (user) => new ModalBuilder().setCustomId('rwm:invia').setTitle('📝 Richiesta Whitelist').addComponents(
  campo('tag', 'Il tuo tag Discord', { value: user.username, max: 40 }),
  campo('nome', 'Il tuo nome reale', { max: 60, placeholder: 'Es. Marco' }),
  campo('eta', 'La tua età', { max: 3, placeholder: 'Es. 18' }),
  campo('orario', 'Fino a che ora sei disponibile per la WL?', { max: 100, placeholder: 'Es. oggi fino alle 23:00' }),
);

async function creaRichiesta(i) {
  const g = i.guild; const r = get(g.id);
  const v = (k) => i.fields.getTextInputValue(k).trim();
  const eta = parseInt(v('eta'), 10);
  if (!(eta >= 5 && eta <= 99)) return i.reply({ content: '❌ Età non valida: scrivi solo il numero, per esempio `18`.', flags: EPH });

  const tag = `richiesta-wl:${i.user.id}`;
  const esistente = g.channels.cache.find((c) => c.topic?.includes(tag));
  if (esistente) return i.reply({ content: `⚠️ Hai già una richiesta aperta: <#${esistente.id}>`, flags: EPH });

  await i.deferReply({ flags: EPH });
  const perms = [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles];
  const parent = r.categoria && g.channels.cache.get(r.categoria)?.type === ChannelType.GuildCategory ? r.categoria : null;
  const ch = await g.channels.create({
    name: `wl-${slug(i.user.username)}`,
    type: ChannelType.GuildText,
    parent,
    topic: `📝 Richiesta whitelist di ${i.user.username} • ${tag}`,
    permissionOverwrites: [
      { id: g.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
      { id: i.user.id, allow: perms },
      { id: i.client.user.id, allow: [...perms, PermissionFlagsBits.ManageChannels] },
      ...staffRuoli(g.id).filter((x) => g.roles.cache.has(x)).map((x) => ({ id: x, allow: perms })),
    ],
  });

  const e = new EmbedBuilder().setColor(ROSA).setTitle('📝 Nuova richiesta whitelist')
    .setDescription(`Richiesta di <@${i.user.id}>\nUno staffer ti contatterà qui per la **WL conoscitiva**. 🌴`)
    .addFields(
      { name: '🏷️ Tag Discord', value: v('tag').slice(0, 1024), inline: true },
      { name: '👤 Nome reale', value: v('nome').slice(0, 1024), inline: true },
      { name: '🎂 Età', value: String(eta), inline: true },
      { name: '🕒 Disponibile fino a', value: v('orario').slice(0, 1024) },
      { name: '📌 Stato', value: '⏳ In attesa dello staff' },
    )
    .setThumbnail(i.user.displayAvatarURL({ size: 256 }))
    .setFooter({ text: 'VICE LIFE RP 🌴 • Whitelist' }).setTimestamp();
  await ch.send({ content: `<@${i.user.id}>`, embeds: [e], components: [bottoniStaff()] });
  return i.editReply(`✅ Richiesta inviata! Ecco il tuo canale: <#${ch.id}>`);
}

const bottoniStaff = (fine = false) => new ActionRowBuilder().addComponents(
  new ButtonBuilder().setCustomId('rw:claim').setLabel('Prendi in carico').setEmoji('🙋').setStyle(ButtonStyle.Primary).setDisabled(fine),
  new ButtonBuilder().setCustomId('rw:ok').setLabel('Accetta').setEmoji('✅').setStyle(ButtonStyle.Success).setDisabled(fine),
  new ButtonBuilder().setCustomId('rw:no').setLabel('Rifiuta').setEmoji('❌').setStyle(ButtonStyle.Danger).setDisabled(fine),
  new ButtonBuilder().setCustomId('rw:chiudi').setLabel('Chiudi').setEmoji('🔒').setStyle(ButtonStyle.Secondary),
);

// Cambia il campo "Stato" del messaggio della richiesta
async function segnaStato(msg, testo, fine) {
  const e = EmbedBuilder.from(msg.embeds[0]);
  const campi = (e.data.fields ?? []).map((f) => (f.name === '📌 Stato' ? { ...f, value: testo } : f));
  e.setFields(campi);
  if (fine) e.setColor(fine === 'ok' ? '#2ecc71' : '#e74c3c');
  await msg.edit({ embeds: [e], components: [bottoniStaff(Boolean(fine))] });
}

async function azioneStaff(i) {
  const m = i.channel.topic?.match(/richiesta-wl:(\d+)/);
  if (!m) return i.reply({ content: '❌ Questo non è un canale di richiesta whitelist.', flags: EPH });
  const player = m[1];
  const [, b] = i.customId.split(':');
  if (b === 'chiudi') {
    return i.reply({
      content: '🔒 Vuoi chiudere questa richiesta? Il canale verrà eliminato.', flags: EPH,
      components: [new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('rw:chiudisi').setLabel('Sì, chiudi').setStyle(ButtonStyle.Danger),
      )],
    });
  }
  if (b === 'chiudisi') {
    await i.update({ content: '🔒 Chiusura in corso...', components: [] });
    await i.channel.send(`🔒 Richiesta chiusa da <@${i.user.id}>. Il canale verrà eliminato tra 5 secondi.`);
    setTimeout(() => i.channel.delete().catch(() => {}), 5000);
    return;
  }
  if (!isStaff(i)) return i.reply({ content: '❌ Solo lo staff può farlo.', flags: EPH });
  if (b === 'claim') {
    await segnaStato(i.message, `🙋 Presa in carico da <@${i.user.id}>`, null);
    await i.reply({ content: `🙋 <@${i.user.id}> ha preso in carico la richiesta di <@${player}>.` });
    return;
  }
  if (b === 'ok') {
    const r = get(i.guild.id);
    let extra = '';
    if (r.ruoloAccettato) {
      const membro = await i.guild.members.fetch(player).catch(() => null);
      await membro?.roles.add(r.ruoloAccettato, 'Richiesta whitelist accettata')
        .then(() => { extra = ` Ti è stato dato il ruolo <@&${r.ruoloAccettato}>.`; })
        .catch(() => { extra = '\n⚠️ Non sono riuscito a dare il ruolo (controlla la posizione del ruolo del bot).'; });
    }
    await segnaStato(i.message, `✅ Accettata da <@${i.user.id}>`, 'ok');
    await i.reply({ content: `✅ <@${player}> la tua richiesta whitelist è stata **accettata**! Preparati per la WL conoscitiva. 🌴${extra}`, allowedMentions: { users: [player] } });
    return;
  }
  if (b === 'no') {
    return i.showModal(new ModalBuilder().setCustomId('rwm:rifiuta').setTitle('❌ Rifiuta richiesta').addComponents(
      campo('motivo', 'Motivo (facoltativo)', { style: TextInputStyle.Paragraph, max: 1000, required: false }),
    ));
  }
}

async function rifiuta(i) {
  const m = i.channel.topic?.match(/richiesta-wl:(\d+)/);
  if (!m) return i.reply({ content: '❌ Canale non valido.', flags: EPH });
  const motivo = i.fields.getTextInputValue('motivo').trim();
  const richiesta = (await i.channel.messages.fetch({ limit: 20 })).find((x) => x.author.id === i.client.user.id && x.embeds[0]?.title === '📝 Nuova richiesta whitelist');
  if (richiesta) await segnaStato(richiesta, `❌ Rifiutata da <@${i.user.id}>`, 'no');
  return i.reply({ content: `❌ <@${m[1]}> la tua richiesta whitelist è stata **rifiutata**.${motivo ? `\n📝 Motivo: ${motivo}` : ''}`, allowedMentions: { users: [m[1]] } });
}

// ---------- pannello staff (/richiesta-wl) ----------
function pannelloStaff(guild, avviso = '') {
  const r = get(guild.id);
  const cat = new ChannelSelectMenuBuilder().setCustomId('rw:categoria').setPlaceholder('📁 Categoria dove si aprono le richieste')
    .addChannelTypes(ChannelType.GuildCategory);
  if (r.categoria && guild.channels.cache.has(r.categoria)) cat.setDefaultChannels(r.categoria);
  const ruolo = new RoleSelectMenuBuilder().setCustomId('rw:ruolo').setPlaceholder('🎭 Ruolo da dare quando accetti (facoltativo)').setMinValues(0).setMaxValues(1);
  if (r.ruoloAccettato && guild.roles.cache.has(r.ruoloAccettato)) ruolo.setDefaultRoles(r.ruoloAccettato);
  const { embeds, files } = pannelloPubblico(guild, r);
  return {
    content: (
      `## 📝 Richieste Whitelist – VICE LIFE🌴\n` +
      `${r.pubblicato ? `📌 Pubblicato in <#${r.pubblicato.canale}> (si aggiorna da solo)` : '📌 *Non ancora pubblicato*'}\n` +
      `📁 Categoria: ${r.categoria ? `<#${r.categoria}>` : '*nessuna (scegline una qui sotto)*'}\n` +
      `🎭 Ruolo quando accetti: ${r.ruoloAccettato ? `<@&${r.ruoloAccettato}>` : '*nessuno*'}\n` +
      `👮 Le richieste le vede lo staff dei ticket (pulsante 👮 Staff in /ticket)` +
      (avviso ? `\n\n${avviso}` : '')
    ).slice(0, 2000),
    embeds, files, attachments: [],
    components: [
      new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('rw:testi').setLabel('Testi pannello').setEmoji('✏️').setStyle(ButtonStyle.Primary)),
      new ActionRowBuilder().addComponents(cat),
      new ActionRowBuilder().addComponents(ruolo),
      new ActionRowBuilder().addComponents(new ChannelSelectMenuBuilder().setCustomId('rw:pubblica')
        .setPlaceholder('📢 Sposta / ripubblica in un altro canale...').addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)),
    ],
  };
}

const modalTesti = (r) => new ModalBuilder().setCustomId('rwm:testi').setTitle('✏️ Testi pannello richieste').addComponents(
  campo('titolo', 'Titolo', { value: r.titolo, max: 256 }),
  campo('descrizione', 'Descrizione (puoi andare a capo)', { value: r.descrizione, style: TextInputStyle.Paragraph, max: 4000 }),
  campo('pulsante', 'Testo del pulsante', { value: r.pulsante, max: 80 }),
);

async function gestioneStaff(i) {
  if (!i.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) return i.reply({ content: '❌ Non hai i permessi.', flags: EPH });
  const g = i.guild; const r = get(g.id);
  const fatto = async (avviso) => { save(); await aggiorna(g); return i.update(pannelloStaff(g, avviso)); };
  if (i.customId === 'rw:testi') return i.showModal(modalTesti(r));
  if (i.customId === 'rw:categoria') { r.categoria = i.values[0] ?? null; return fatto(`✅ Le richieste si apriranno in <#${r.categoria}>.`); }
  if (i.customId === 'rw:ruolo') { r.ruoloAccettato = i.values[0] ?? null; return fatto(r.ruoloAccettato ? `✅ Quando accetti verrà dato <@&${r.ruoloAccettato}>.` : '✅ Nessun ruolo verrà dato.'); }
  if (i.customId === 'rw:pubblica') {
    try { await pubblica(g, i.values[0]); return i.update(pannelloStaff(g, `✅ Pubblicato in <#${i.values[0]}>.`)); } catch (e) { return i.update(pannelloStaff(g, `❌ Non posso scrivere lì: ${e.message}`)); }
  }
  if (i.customId === 'rwm:testi') {
    const v = (k) => i.fields.getTextInputValue(k).trim();
    Object.assign(r, { titolo: v('titolo') || DEFAULT.titolo, descrizione: v('descrizione') || DEFAULT.descrizione, pulsante: v('pulsante') || DEFAULT.pulsante });
    return fatto('✅ Testi aggiornati.');
  }
}

async function handle(i) {
  if (i.isChatInputCommand()) return i.reply({ ...pannelloStaff(i.guild), flags: EPH });
  const id = i.customId;
  if (id === 'rw:apri') return i.showModal(modalRichiesta(i.user));
  if (id === 'rwm:invia') return creaRichiesta(i);
  if (id === 'rwm:rifiuta') return rifiuta(i);
  if (['rw:claim', 'rw:ok', 'rw:no', 'rw:chiudi', 'rw:chiudisi'].includes(id)) return azioneStaff(i);
  return gestioneStaff(i);
}

// All'avvio: pubblica il pannello nel canale richieste se non c'è, altrimenti lo aggiorna
async function onReady(guild) {
  const r = get(guild.id);
  if (r.pubblicato) return aggiorna(guild);
  if (!guild.channels.cache.has(r.canale)) return null;
  try { await pubblica(guild, r.canale); console.log('📝 Pannello richieste whitelist pubblicato'); } catch (e) { console.warn(`[richiesta-wl] ${e.message}`); }
  return null;
}

module.exports = {
  init(cfgFn, saveFn) { cfg = cfgFn; save = saveFn; },
  command: new SlashCommandBuilder().setName('richiesta-wl').setDescription('Personalizza il pannello delle richieste whitelist')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild).setDMPermission(false).toJSON(),
  isRichiesta: (i) => (i.isChatInputCommand() && i.commandName === 'richiesta-wl') || /^rwm?:/.test(i.customId ?? ''),
  handle, onReady,
  _pannelloStaff: pannelloStaff, _pannelloPubblico: pannelloPubblico, _modalRichiesta: modalRichiesta, _modalTesti: modalTesti, _get: get,
};
