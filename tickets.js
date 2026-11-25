// ================================================
//   VICE LIFE🌴  -  SISTEMA TICKET
//   /ticket -> pannello admin per creare un pannello ticket pubblico,
//              completamente personalizzabile, che resta sempre in chat.
// ================================================
const {
  ChannelType, PermissionFlagsBits, MessageFlags, EmbedBuilder, SlashCommandBuilder,
  ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder,
  ChannelSelectMenuBuilder, RoleSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle,
  AttachmentBuilder,
} = require('discord.js');
const path = require('path');

// Banner ufficiale del pannello ticket (dentro la cartella del bot)
const BANNER_TICKET = path.join(__dirname, 'banner-ticket.jpg');
const usaBanner = (t) => t.immagine === 'vicelife';
const bannerFiles = (t) => (usaBanner(t) ? [new AttachmentBuilder(BANNER_TICKET, { name: 'banner-ticket.jpg' })] : []);

const EPH = MessageFlags.Ephemeral;
let cfg; let save;

const STILI = ['Primary', 'Success', 'Danger', 'Secondary'];
const STILI_NOME = { Primary: '🔵 Blu', Success: '🟢 Verde', Danger: '🔴 Rosso', Secondary: '⚪ Grigio' };

const DEFAULT = {
  titolo: '🎫 Assistenza VICE LIFE🌴',
  descrizione: 'Hai bisogno di aiuto? Apri un ticket scegliendo il tipo qui sotto 👇\n\nUno staffer ti risponderà il prima possibile.',
  footer: 'VICE LIFE🌴 • Sistema ticket',
  colore: '#ff2d95',
  immagine: 'vicelife',
  miniatura: 'server',
  modalita: 'pulsanti', // 'pulsanti' oppure 'menu'
  placeholder: '📩 Scegli il tipo di ticket',
  tipi: [{
    id: 'assistenza', nome: 'Assistenza', emoji: '🎫', descrizione: 'Domande e aiuto generale',
    messaggio: 'Ciao {user}! 👋\nDescrivi il tuo problema e uno staffer ti risponderà al più presto.',
    categoria: null, ruoli: [], stile: 'Primary',
  }],
  pubblicato: null, // { canale, messaggio }
};

// ---------- utilità ----------
// Ruoli staff che vedono TUTTI i ticket (oltre a quelli scelti per ogni tipo)
const DEFAULT_STAFF = [
  '1575142910888906862', '1575143071564304454', '1575143178414063649', '1575143272404357200',
  '1575143396572528722', '1575144009914122242', '1575144054608502915', '1575144091333824512',
  '1575144154814480496', '1575144181167554671', '1575144207906250842', '1575144231134040104',
  '1575144400399499304', '1575144537926672455', '1575144590724304917', '1575144642565898330',
  '1575144673981501630', '1575144703987294369', '1575144736015261774',
];
function get(gid) {
  const t = (cfg(gid).tickets ??= structuredClone(DEFAULT));
  t.staff ??= [...DEFAULT_STAFF];
  if ((t.bannerVer ?? 1) < 2) { // banner ufficiale VICE LIFE TICKET sul pannello
    t.immagine = 'vicelife';
    t.bannerVer = 2;
    save?.();
  }
  if ((t.staffVer ?? 1) < 4) { // rimette sempre tutti i 12 ruoli staff ufficiali
    t.staff = [...new Set([...DEFAULT_STAFF, ...(t.staff ?? []).filter((r) => r !== '1575143684528279654')])];
    t.staffVer = 4;
    save?.();
  }
  if ((t.staffVer ?? 1) < 2) { // correzione staff: +1575144181167554671, -1575143684528279654
    t.staff = [...new Set([...t.staff.filter((r) => r !== '1575143684528279654'), '1575144181167554671'])];
    t.staffVer = 2;
    save?.();
  }
  return t;
}
// Tutti i ruoli staff di un tipo: staff generale + ruoli del tipo
// Chi vede un ticket: se il tipo ha ruoli scelti, SOLO quelli; altrimenti tutto lo staff generale
const staffDi = (t, tipo) => (tipo?.ruoli?.length ? tipo.ruoli : (t.staff ?? []));
const isUrl = (s) => /^https?:\/\/\S+$/i.test(s);
const isEmoji = (s) => /^<a?:\w{2,32}:\d{17,20}>$/.test(s)
  || (s.length <= 16 && /\p{Extended_Pictographic}|\p{Regional_Indicator}/u.test(s) && !/[a-z]/i.test(s));
const slug = (s) => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'ticket';
const fill = (text, member, tipo) => (text || '')
  .replace(/{user}/g, `<@${member.id}>`)
  .replace(/{username}/g, member.user.username)
  .replace(/{server}/g, member.guild.name)
  .replace(/{tipo}/g, tipo?.nome ?? '');
const findTipo = (t, id) => t.tipi.find((x) => x.id === id);
const tipoLabel = (tipo) => `${tipo.emoji ? `${tipo.emoji} ` : ''}${tipo.nome}`;

function input(id, label, value, { style = TextInputStyle.Short, max = 256, placeholder = '', required = false } = {}) {
  const t = new TextInputBuilder().setCustomId(id).setLabel(label).setStyle(style).setRequired(required).setMaxLength(max);
  if (value) t.setValue(String(value).slice(0, max));
  if (placeholder) t.setPlaceholder(placeholder);
  return new ActionRowBuilder().addComponents(t);
}

// ---------- messaggio pubblico (quello che resta in chat) ----------
function publicEmbed(guild, t) {
  const e = new EmbedBuilder().setColor(t.colore || DEFAULT.colore)
    .setDescription((t.descrizione || '​').slice(0, 4096));
  if (t.titolo) e.setTitle(t.titolo.slice(0, 256));
  if (t.miniatura === 'server' && guild.iconURL()) e.setThumbnail(guild.iconURL({ size: 256 }));
  else if (isUrl(t.miniatura)) e.setThumbnail(t.miniatura);
  if (usaBanner(t)) e.setImage('attachment://banner-ticket.jpg');
  else if (isUrl(t.immagine)) e.setImage(t.immagine);
  if (t.footer) e.setFooter({ text: t.footer.slice(0, 2048), iconURL: guild.iconURL() ?? undefined });
  return e;
}

function publicComponents(t) {
  if (!t.tipi.length) return [];
  if (t.modalita === 'menu') {
    const menu = new StringSelectMenuBuilder().setCustomId('tko').setPlaceholder((t.placeholder || DEFAULT.placeholder).slice(0, 150));
    for (const tipo of t.tipi) {
      const o = { label: tipo.nome.slice(0, 100), value: tipo.id };
      if (tipo.descrizione) o.description = tipo.descrizione.slice(0, 100);
      if (tipo.emoji) o.emoji = tipo.emoji;
      menu.addOptions(o);
    }
    return [new ActionRowBuilder().addComponents(menu)];
  }
  const rows = [];
  t.tipi.slice(0, 25).forEach((tipo, n) => {
    if (n % 5 === 0) rows.push(new ActionRowBuilder());
    const b = new ButtonBuilder().setCustomId(`tko:${tipo.id}`).setLabel(tipo.nome.slice(0, 80))
      .setStyle(ButtonStyle[tipo.stile] ?? ButtonStyle.Primary);
    if (tipo.emoji) b.setEmoji(tipo.emoji);
    rows.at(-1).addComponents(b);
  });
  return rows;
}

const publicMessage = (guild, t) => ({
  embeds: [publicEmbed(guild, t)], components: publicComponents(t), files: bannerFiles(t), attachments: [],
});

// Aggiorna da solo il pannello già pubblicato dopo ogni modifica
async function refreshPublished(guild) {
  const t = get(guild.id);
  if (!t.pubblicato) return true;
  try {
    const ch = await guild.channels.fetch(t.pubblicato.canale);
    const msg = await ch.messages.fetch(t.pubblicato.messaggio);
    await msg.edit(publicMessage(guild, t));
    return true;
  } catch { return false; }
}

// ---------- pannello admin ----------
function adminPanel(guild, warning = '') {
  const t = get(guild.id);
  const tipi = t.tipi.length
    ? t.tipi.map((tp) => `${tipoLabel(tp)} → 📁 ${tp.categoria ? `<#${tp.categoria}>` : '⚠️ *nessuna categoria*'} · 👮 ${tp.ruoli.length ? tp.ruoli.map((r) => `<@&${r}>`).join(' ') : '*nessun ruolo staff*'}`).join('\n')
    : '*Nessun tipo: premi ➕ Aggiungi tipo*';
  const staffValidi = t.staff.filter((r) => guild.roles.cache.has(r));
  const pub = t.pubblicato ? `📌 Pubblicato in <#${t.pubblicato.canale}> (si aggiorna da solo)` : '📌 *Non ancora pubblicato*';
  const content = (
    `## 🎫 Pannello Ticket – VICE LIFE🌴\n${pub}  •  Modalità: **${t.modalita === 'menu' ? 'Menu a tendina' : 'Pulsanti'}**\n\n` +
    `👮 **Staff che vede tutti i ticket** (modifica con il pulsante 👮 Staff): ${staffValidi.length ? staffValidi.map((r) => `<@&${r}>`).join(' ') : '*nessuno*'}\n\n` +
    `**Tipi di ticket:**\n${tipi}\n\n👇 **Anteprima del pannello pubblico:**` +
    (warning ? `\n\n${warning}` : '')
  ).slice(0, 2000);

  const components = [];
  if (t.tipi.length) {
    components.push(new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder().setCustomId('tk:tipo').setPlaceholder('✏️ Modifica un tipo (nome, emoji, categoria, staff...)')
        .addOptions(t.tipi.map((tp) => ({ label: `Modifica: ${tp.nome}`.slice(0, 100), value: tp.id, ...(tp.emoji ? { emoji: tp.emoji } : {}) }))),
    ));
    components.push(new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder().setCustomId('tk:elimina').setPlaceholder('🗑️ Elimina un tipo di ticket')
        .addOptions(t.tipi.map((tp) => ({ label: `Elimina: ${tp.nome}`.slice(0, 100), value: tp.id, ...(tp.emoji ? { emoji: tp.emoji } : {}) }))),
    ));
  }
  components.push(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('tk:testi').setLabel('Testi pannello').setEmoji('✏️').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('tk:stile').setLabel('Colore & Immagini').setEmoji('🎨').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('tk:add').setLabel('Aggiungi tipo').setEmoji('➕').setStyle(ButtonStyle.Success).setDisabled(t.tipi.length >= 25),
      new ButtonBuilder().setCustomId('tk:mode').setLabel(t.modalita === 'menu' ? 'Usa pulsanti' : 'Usa menu a tendina').setEmoji('🔁').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('tk:staffpanel').setLabel('Staff').setEmoji('👮').setStyle(ButtonStyle.Secondary),
    ),
    new ActionRowBuilder().addComponents(
      new ChannelSelectMenuBuilder().setCustomId('tk:pubblica').setPlaceholder('📢 Pubblica il pannello in un canale...')
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement),
    ),
  );
  return { content, embeds: [publicEmbed(guild, t)], components, files: bannerFiles(t), attachments: [] };
}

// Due menu: uno per AGGIUNGERE ruoli (mostra tutti i ruoli) e uno per TOGLIERLI
// scelte = null -> menu con tutti i ruoli del server; array -> menu solo con quei ruoli
function righeRuoli(guild, lista, idAdd, idDel, cosa, scelte = null) {
  const righe = [];
  if (!scelte) {
    righe.push(new ActionRowBuilder().addComponents(
      new RoleSelectMenuBuilder().setCustomId(idAdd).setPlaceholder(`➕ Aggiungi ruoli ${cosa}`).setMinValues(1).setMaxValues(25),
    ));
  } else {
    const disponibili = scelte.filter((r) => guild.roles.cache.has(r) && !lista.includes(r)).slice(0, 25);
    if (disponibili.length) {
      righe.push(new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder().setCustomId(idAdd).setPlaceholder(`➕ Aggiungi ruoli ${cosa}`)
          .setMinValues(1).setMaxValues(disponibili.length)
          .addOptions(disponibili.map((r) => ({ label: guild.roles.cache.get(r).name.slice(0, 100), value: r }))),
      ));
    }
  }
  const validi = lista.filter((r) => guild.roles.cache.has(r)).slice(0, 25);
  if (validi.length) {
    righe.push(new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder().setCustomId(idDel).setPlaceholder(`➖ Togli ruoli ${cosa}`)
        .setMinValues(1).setMaxValues(validi.length)
        .addOptions(validi.map((r) => ({ label: guild.roles.cache.get(r).name.slice(0, 100), value: r }))),
    ));
  }
  return righe;
}

function staffPanel(guild, warning = '') {
  const t = get(guild.id);
  const validi = t.staff.filter((r) => guild.roles.cache.has(r));
  return {
    content: (
      `## 👮 Staff che vede TUTTI i ticket (${validi.length}/25)\n` +
      (validi.length ? validi.map((r) => `• <@&${r}>`).join('\n') : '*nessun ruolo*') +
      '\n\n➕ Usa il primo menu per **aggiungere** ruoli, ➖ il secondo per **toglierli**.' +
      (warning ? `\n\n${warning}` : '')
    ).slice(0, 2000),
    embeds: [], files: [], attachments: [],
    components: [
      ...righeRuoli(guild, t.staff, 'tk:staffadd', 'tk:staffdel', 'allo staff'),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('tk:back').setLabel('Indietro').setEmoji('⬅️').setStyle(ButtonStyle.Secondary),
      ),
    ],
  };
}

function tipoPanel(guild, tipo, warning = '') {
  const staffGen = get(guild.id).staff.filter((r) => guild.roles.cache.has(r));
  const content = (
    `## ${tipoLabel(tipo)} – impostazioni tipo\n` +
    `📝 Descrizione: ${tipo.descrizione || '*nessuna*'}\n` +
    `📁 Categoria dei ticket: ${tipo.categoria ? `<#${tipo.categoria}>` : '⚠️ *nessuna (scegline una qui sotto)*'}\n` +
    (tipo.ruoli.length
      ? `👮 **Vedono questi ticket SOLO:** ${tipo.ruoli.map((r) => `<@&${r}>`).join(' ')}\n`
      : `👮 **Vedono questi ticket:** tutto lo staff (${staffGen.length} ruoli). Scegli dei ruoli qui sotto se vuoi che li veda solo una parte dello staff.\n`) +
    `🎨 Colore pulsante: ${STILI_NOME[tipo.stile] ?? STILI_NOME.Primary}\n\n` +
    `💬 **Messaggio dentro il ticket:**\n${tipo.messaggio || '*nessuno*'}` +
    (warning ? `\n\n${warning}` : '')
  ).slice(0, 2000);

  const cat = new ChannelSelectMenuBuilder().setCustomId(`tk:cat:${tipo.id}`)
    .setPlaceholder('📁 Categoria dove vanno questi ticket').addChannelTypes(ChannelType.GuildCategory);
  if (tipo.categoria && guild.channels.cache.has(tipo.categoria)) cat.setDefaultChannels(tipo.categoria);

  return {
    content, embeds: [], files: [], attachments: [],
    components: [
      new ActionRowBuilder().addComponents(cat),
      ...righeRuoli(guild, tipo.ruoli, `tk:ruoliadd:${tipo.id}`, `tk:ruolidel:${tipo.id}`, 'staff per questo tipo', [...new Set([...DEFAULT_STAFF, ...get(guild.id).staff])]),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`tk:edit:${tipo.id}`).setLabel('Modifica testi').setEmoji('✏️').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`tk:colbtn:${tipo.id}`).setLabel('Colore pulsante').setEmoji('🎨').setStyle(ButtonStyle[tipo.stile] ?? ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`tk:del:${tipo.id}`).setLabel('Elimina tipo').setEmoji('🗑️').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('tk:back').setLabel('Indietro').setEmoji('⬅️').setStyle(ButtonStyle.Secondary),
      ),
    ],
  };
}

// Conferma prima di eliminare un tipo
const confermaElimina = (tipo) => ({
  content: `## 🗑️ Eliminare ${tipoLabel(tipo)}?\n` +
    'Il pulsante/opzione sparirà dal pannello pubblico.\n' +
    '*I ticket già aperti e la categoria di Discord NON vengono cancellati.*',
  embeds: [], files: [], attachments: [],
  components: [new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`tk:delok:${tipo.id}`).setLabel('Sì, elimina').setEmoji('🗑️').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('tk:back').setLabel('Annulla').setEmoji('⬅️').setStyle(ButtonStyle.Secondary),
  )],
});

const modalTesti = (t) => new ModalBuilder().setCustomId('tkm:testi').setTitle('✏️ Testi del pannello').addComponents(
  input('titolo', 'Titolo', t.titolo),
  input('descrizione', 'Descrizione (puoi andare a capo)', t.descrizione, { style: TextInputStyle.Paragraph, max: 4000 }),
  input('footer', 'Footer (riga in basso)', t.footer, { max: 1024 }),
  input('placeholder', 'Testo del menu a tendina', t.placeholder, { max: 150 }),
);
const modalStile = (t) => new ModalBuilder().setCustomId('tkm:stile').setTitle('🎨 Colore & Immagini').addComponents(
  input('colore', 'Colore (codice HEX)', t.colore, { max: 7, placeholder: '#ff2d95' }),
  input('immagine', 'Banner: vicelife / link / vuoto', t.immagine, { max: 1000, placeholder: 'vicelife = banner ufficiale VICE LIFE TICKET' }),
  input('miniatura', 'Miniatura: server / link / vuoto', t.miniatura, { max: 1000, placeholder: 'server' }),
);
const modalTipo = (tipo) => new ModalBuilder().setCustomId(tipo ? `tkm:edit:${tipo.id}` : 'tkm:add')
  .setTitle(tipo ? `✏️ Modifica: ${tipo.nome}`.slice(0, 45) : '➕ Nuovo tipo di ticket').addComponents(
    input('nome', 'Nome (es. Assistenza, Segnalazioni, Fazioni)', tipo?.nome, { max: 80, required: true }),
    input('emoji', 'Emoji (es. 🎫 🚔 💼) – facoltativa', tipo?.emoji, { max: 64 }),
    input('descrizione', 'Descrizione breve (per il menu)', tipo?.descrizione, { max: 100 }),
    input('messaggio', 'Messaggio dentro il ticket', tipo?.messaggio ?? DEFAULT.tipi[0].messaggio,
      { style: TextInputStyle.Paragraph, max: 4000, placeholder: 'Usa {user} {tipo} {server}' }),
  );

// ---------- azioni admin ----------
async function handleAdmin(i) {
  const g = i.guild;
  const t = get(g.id);
  const [a, b, id] = i.customId.split(':');
  const done = async (warning, tipo, vista) => {
    save();
    const ok = await refreshPublished(g);
    const w = ok ? warning : `${warning}\n⚠️ Non trovo più il pannello pubblicato: ripubblicalo dal menu 📢.`;
    if (vista === 'staff') return i.update(staffPanel(g, w));
    return i.update(tipo ? tipoPanel(g, tipo, w) : adminPanel(g, w));
  };

  if (a === 'tk') {
    if (b === 'testi') return i.showModal(modalTesti(t));
    if (b === 'stile') return i.showModal(modalStile(t));
    if (b === 'add') return i.showModal(modalTipo(null));
    if (b === 'back') return i.update(adminPanel(g));
    if (b === 'mode') {
      t.modalita = t.modalita === 'menu' ? 'pulsanti' : 'menu';
      return done(`🔁 Ora il pannello usa: **${t.modalita === 'menu' ? 'menu a tendina' : 'pulsanti'}**.`);
    }
    if (b === 'tipo') {
      const tipo = findTipo(t, i.values[0]);
      return i.update(tipo ? tipoPanel(g, tipo) : adminPanel(g, '⚠️ Tipo non trovato.'));
    }
    if (b === 'pubblica') {
      if (!t.tipi.length) return i.update(adminPanel(g, '⚠️ Aggiungi almeno un tipo di ticket prima di pubblicare.'));
      const ch = g.channels.cache.get(i.values[0]);
      try {
        const msg = await ch.send(publicMessage(g, t));
        if (t.pubblicato) { // cancella il vecchio pannello
          const old = await g.channels.fetch(t.pubblicato.canale).catch(() => null);
          await old?.messages.delete(t.pubblicato.messaggio).catch(() => {});
        }
        t.pubblicato = { canale: ch.id, messaggio: msg.id };
        save();
        return i.update(adminPanel(g, `✅ Pannello pubblicato in <#${ch.id}>! Resta lì per sempre e si aggiorna da solo.`));
      } catch (e) {
        return i.update(adminPanel(g, `❌ Non posso scrivere in <#${ch.id}>: ${e.message}`));
      }
    }
    if (b === 'aggiorna') {
      const ok = await refreshPublished(g);
      return i.update(adminPanel(g, ok ? '🔄 Pannello pubblicato aggiornato.' : '⚠️ Non trovo più il pannello: ripubblicalo dal menu 📢.'));
    }

    if (b === 'elimina') {
      const tipo = findTipo(t, i.values[0]);
      return i.update(tipo ? confermaElimina(tipo) : adminPanel(g, '⚠️ Tipo non trovato.'));
    }
    if (b === 'staffpanel') return i.update(staffPanel(g));
    if (b === 'staffadd') {
      t.staff = [...new Set([...t.staff, ...i.values])].slice(0, 25);
      return done(`✅ Aggiunti: ${i.values.map((r) => `<@&${r}>`).join(' ')}`, null, 'staff');
    }
    if (b === 'staffdel') {
      t.staff = t.staff.filter((r) => !i.values.includes(r));
      return done(`➖ Tolti: ${i.values.map((r) => `<@&${r}>`).join(' ')}`, null, 'staff');
    }

    const tipo = findTipo(t, id);
    if (!tipo) return i.update(adminPanel(g, '⚠️ Tipo non trovato.'));
    if (b === 'cat') { tipo.categoria = i.values[0] ?? null; return done(`✅ I ticket **${tipo.nome}** andranno in <#${tipo.categoria}>.`, tipo); }
    if (b === 'ruoliadd') { tipo.ruoli = [...new Set([...tipo.ruoli, ...i.values])].slice(0, 25); return done('✅ Ruoli aggiunti.', tipo); }
    if (b === 'ruolidel') { tipo.ruoli = tipo.ruoli.filter((r) => !i.values.includes(r)); return done('➖ Ruoli tolti.', tipo); }
    if (b === 'edit') return i.showModal(modalTipo(tipo));
    if (b === 'colbtn') {
      tipo.stile = STILI[(STILI.indexOf(tipo.stile) + 1) % STILI.length];
      return done(`🎨 Colore pulsante: ${STILI_NOME[tipo.stile]}`, tipo);
    }
    if (b === 'del') return i.update(confermaElimina(tipo));
    if (b === 'delok') {
      t.tipi = t.tipi.filter((x) => x.id !== tipo.id);
      return done(`🗑️ Tipo **${tipo.nome}** eliminato.`);
    }
  }

  if (a === 'tkm') {
    const v = (k) => i.fields.getTextInputValue(k).trim();
    if (b === 'testi') {
      Object.assign(t, { titolo: v('titolo'), descrizione: v('descrizione'), footer: v('footer'), placeholder: v('placeholder') });
      return done('✅ Testi aggiornati.');
    }
    if (b === 'stile') {
      const errori = [];
      let colore = v('colore');
      if (colore) {
        if (!colore.startsWith('#')) colore = `#${colore}`;
        if (/^#[0-9a-f]{6}$/i.test(colore)) t.colore = colore; else errori.push('colore non valido (usa tipo `#ff2d95`)');
      }
      const img = v('immagine');
      if (!img || isUrl(img) || img.toLowerCase() === 'vicelife') t.immagine = img.toLowerCase() === 'vicelife' ? 'vicelife' : img;
      else errori.push('banner non valido (scrivi vicelife, un link o lascia vuoto)');
      const mini = v('miniatura').toLowerCase() === 'server' ? 'server' : v('miniatura');
      if (!mini || mini === 'server' || isUrl(mini)) t.miniatura = mini; else errori.push('miniatura non valida');
      return done(errori.length ? `⚠️ Salvato, ma: ${errori.join(', ')}.` : '✅ Stile aggiornato.');
    }
    if (b === 'add' || b === 'edit') {
      const emoji = v('emoji');
      const warn = emoji && !isEmoji(emoji) ? '\n⚠️ Emoji non valida, l\'ho tolta.' : '';
      const dati = { nome: v('nome'), emoji: emoji && isEmoji(emoji) ? emoji : '', descrizione: v('descrizione'), messaggio: v('messaggio') };
      if (b === 'add') {
        const tipo = { id: Date.now().toString(36), categoria: null, ruoli: [], stile: 'Primary', ...dati };
        t.tipi.push(tipo);
        return done(`✅ Tipo **${tipo.nome}** creato! Ora scegli la **categoria** e i **ruoli staff** qui sotto.${warn}`, tipo);
      }
      const tipo = findTipo(t, id);
      if (!tipo) return i.update(adminPanel(g, '⚠️ Tipo non trovato.'));
      Object.assign(tipo, dati);
      return done(`✅ Tipo aggiornato.${warn}`, tipo);
    }
  }
}

// ---------- azioni pubbliche: apri / prendi in carico / chiudi ----------
async function openTicket(i, tipoId) {
  const g = i.guild;
  const t = get(g.id);
  const tipo = findTipo(t, tipoId);
  if (!tipo) return i.reply({ content: '❌ Questo tipo di ticket non esiste più.', flags: EPH });

  const tag = `ticket:${i.user.id}:${tipo.id}`;
  const esistente = g.channels.cache.find((c) => c.topic?.includes(tag));
  if (esistente) return i.reply({ content: `⚠️ Hai già un ticket **${tipo.nome}** aperto: <#${esistente.id}>`, flags: EPH });

  await i.deferReply({ flags: EPH });
  const perms = [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory,
    PermissionFlagsBits.AttachFiles, PermissionFlagsBits.EmbedLinks];
  const parent = tipo.categoria && g.channels.cache.get(tipo.categoria)?.type === ChannelType.GuildCategory ? tipo.categoria : null;

  const ch = await g.channels.create({
    name: `${slug(tipo.nome)}-${slug(i.user.username)}`,
    type: ChannelType.GuildText,
    parent,
    topic: `${tipoLabel(tipo)} • aperto da ${i.user.username} • ${tag}`,
    permissionOverwrites: [
      { id: g.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
      { id: i.user.id, allow: perms },
      { id: i.client.user.id, allow: [...perms, PermissionFlagsBits.ManageChannels] },
      ...staffDi(t, tipo).filter((r) => g.roles.cache.has(r)).map((r) => ({ id: r, allow: perms })),
    ],
  });

  const embed = new EmbedBuilder().setColor(t.colore || DEFAULT.colore)
    .setTitle(`${tipoLabel(tipo)}`.slice(0, 256))
    .setDescription(fill(tipo.messaggio, i.member, tipo).slice(0, 4096) || '​')
    .setFooter({ text: `${g.name} • Ticket di ${i.user.username}`, iconURL: g.iconURL() ?? undefined })
    .setTimestamp();
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('tkclaim').setLabel('Prendi in carico').setEmoji('🙋').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('tkc').setLabel('Chiudi ticket').setEmoji('🔒').setStyle(ButtonStyle.Danger),
  );
  // Tagga i ruoli del tipo; se non ci sono, tagga lo staff generale
  const staff = (tipo.ruoli.length ? tipo.ruoli : t.staff).filter((r) => g.roles.cache.has(r)).map((r) => `<@&${r}>`).join(' ');
  await ch.send({ content: `<@${i.user.id}> ${staff}`.trim(), embeds: [embed], components: [row] });
  return i.editReply(`✅ Ticket creato: <#${ch.id}>`);
}

const ticketInfo = (channel) => {
  const m = channel.topic?.match(/ticket:(\d+):(\w+)/);
  return m ? { userId: m[1], tipoId: m[2] } : null;
};

async function handlePublic(i) {
  const [a, b] = i.customId.split(':');
  if (a === 'tko') return openTicket(i, b ?? i.values?.[0]);

  const info = ticketInfo(i.channel);
  if (!info) return i.reply({ content: '❌ Questo non è un canale ticket.', flags: EPH });
  const tipo = findTipo(get(i.guild.id), info.tipoId);
  const isStaff = i.memberPermissions.has(PermissionFlagsBits.ManageChannels)
    || staffDi(get(i.guild.id), tipo).some((r) => i.member.roles.cache.has(r));

  if (a === 'tkclaim') {
    if (!isStaff) return i.reply({ content: '❌ Solo lo staff può prendere in carico il ticket.', flags: EPH });
    const row = ActionRowBuilder.from(i.message.components[0]);
    row.components[0].setDisabled(true).setLabel(`Preso da ${i.member.displayName}`.slice(0, 80));
    await i.update({ components: [row] });
    return i.channel.send(`🙋 <@${i.user.id}> ha preso in carico questo ticket.`);
  }

  if (a === 'tkc') {
    if (!b) {
      return i.reply({
        content: '🔒 Vuoi davvero chiudere questo ticket? Il canale verrà eliminato.', flags: EPH,
        components: [new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('tkc:si').setLabel('Sì, chiudi').setStyle(ButtonStyle.Danger),
          new ButtonBuilder().setCustomId('tkc:no').setLabel('Annulla').setStyle(ButtonStyle.Secondary),
        )],
      });
    }
    if (b === 'no') return i.update({ content: '👍 Chiusura annullata.', components: [] });
    if (b === 'si') {
      await i.update({ content: '🔒 Chiusura in corso...', components: [] });
      await i.channel.send(`🔒 Ticket chiuso da <@${i.user.id}>. Il canale verrà eliminato tra 5 secondi.`);
      setTimeout(() => i.channel.delete().catch(() => {}), 5000);
    }
  }
}

// ---------- export ----------
module.exports = {
  init(cfgFn, saveFn) { cfg = cfgFn; save = saveFn; },
  // All'avvio aggiorna il pannello pubblicato (es. nuovo banner)
  async onReady(guild) { if (cfg(guild.id).tickets) { get(guild.id); await refreshPublished(guild); } },
  command: new SlashCommandBuilder()
    .setName('ticket')
    .setDescription('Apri il pannello per creare e gestire il sistema ticket')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setDMPermission(false)
    .toJSON(),
  isTicket: (i) => (i.isChatInputCommand() && i.commandName === 'ticket') || /^tk/.test(i.customId ?? ''),
  async handle(i) {
    if (i.isChatInputCommand()) return i.reply({ ...adminPanel(i.guild), flags: EPH });
    if (/^tkm?:/.test(i.customId)) {
      if (!i.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) return i.reply({ content: '❌ Non hai i permessi.', flags: EPH });
      return handleAdmin(i);
    }
    return handlePublic(i);
  },
  // per i test
  _adminPanel: adminPanel, _tipoPanel: tipoPanel, _publicMessage: publicMessage, _modalTipo: modalTipo, _modalTesti: modalTesti, _modalStile: modalStile, _get: get,
};
