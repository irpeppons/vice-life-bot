// ================================================
//   VICE LIFE🌴  -  MESSAGGI INFORMATIVI MODIFICABILI
//   Crea un messaggio fisso con banner + sezioni in un canale e un comando
//   per modificarlo (aggiungi / modifica / elimina sezioni).
//   Usato per: /lavori-info
// ================================================
const path = require('path');
const {
  ChannelType, PermissionFlagsBits, MessageFlags, EmbedBuilder, SlashCommandBuilder, AttachmentBuilder,
  ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, ChannelSelectMenuBuilder,
  ModalBuilder, TextInputBuilder, TextInputStyle,
} = require('discord.js');

const EPH = MessageFlags.Ephemeral;
const ROSA = '#ff2d95';
const BANNER = 'banner-vicelife.jpg';

function creaInfo({ chiave, prefisso, comando, descrizioneComando, nome, canale, footer, sezioni }) {
  let cfg; let save;
  const nuovoId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  function get(gid) {
    const w = (cfg(gid)[chiave] ??= { canale, sezioni: structuredClone(sezioni), pubblicato: null });
    w.sezioni.forEach((x) => { x.id ??= nuovoId(); });
    return w;
  }
  const lunghezza = (w) => w.sezioni.reduce((t, x) => t + (x.titolo?.length ?? 0) + (x.testo?.length ?? 0), 0) + 40;

  function messaggio(guild, w) {
    const banner = new EmbedBuilder().setColor(ROSA).setImage(`attachment://${BANNER}`);
    const embeds = w.sezioni.slice(0, 9).map((x, n, tutte) => {
      const e = new EmbedBuilder().setColor(ROSA).setDescription((x.testo || '​').slice(0, 4096));
      if (x.titolo) e.setTitle(x.titolo.slice(0, 256));
      if (n === tutte.length - 1) e.setFooter({ text: footer, iconURL: guild.iconURL() ?? undefined }).setTimestamp();
      return e;
    });
    return { embeds: [banner, ...embeds], files: [new AttachmentBuilder(path.join(__dirname, BANNER), { name: BANNER })], attachments: [] };
  }

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
      await (await ch.messages.fetch(w.pubblicato.messaggio)).edit(messaggio(guild, w));
      return true;
    } catch { return false; }
  }

  function pannello(guild, avviso = '') {
    const w = get(guild.id);
    const elenco = w.sezioni.map((x, n) => `${n + 1}. ${x.titolo || '*(senza titolo)*'}`).join('\n') || '*nessuna sezione*';
    const rows = [];
    if (w.sezioni.length) {
      const opz = (pre) => w.sezioni.map((x, n) => ({ label: `${pre}${n + 1}. ${x.titolo || 'senza titolo'}`.slice(0, 100), value: x.id }));
      rows.push(new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(`${prefisso}:modifica`).setPlaceholder('✏️ Modifica una sezione').addOptions(opz(''))));
      rows.push(new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(`${prefisso}:elimina`).setPlaceholder('🗑️ Elimina una sezione').addOptions(opz('Elimina: '))));
    }
    rows.push(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`${prefisso}:aggiungi`).setLabel('Aggiungi sezione').setEmoji('➕').setStyle(ButtonStyle.Success).setDisabled(w.sezioni.length >= 9),
        new ButtonBuilder().setCustomId(`${prefisso}:ripristina`).setLabel('Ripristina testi originali').setEmoji('🔄').setStyle(ButtonStyle.Secondary),
      ),
      new ActionRowBuilder().addComponents(new ChannelSelectMenuBuilder().setCustomId(`${prefisso}:pubblica`)
        .setPlaceholder('📢 Sposta / ripubblica in un altro canale...').addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)),
    );
    const pieno = lunghezza(w) > 6000 ? '\n⚠️ Testo troppo lungo (max 6000 caratteri in tutto): accorcia qualche sezione.' : '';
    return {
      content: (`## ${nome}\n${w.pubblicato ? `📌 Pubblicato in <#${w.pubblicato.canale}> (si aggiorna da solo)` : '📌 *Non ancora pubblicato*'}\n` +
        `✍️ Caratteri usati: **${lunghezza(w)}/6000**${pieno}\n\n**Sezioni:**\n${elenco}` + (avviso ? `\n\n${avviso}` : '')).slice(0, 2000),
      embeds: [], files: [], attachments: [], components: rows,
    };
  }

  const modalSezione = (x) => new ModalBuilder().setCustomId(x ? `${prefisso}m:sez:${x.id}` : `${prefisso}m:sez`).setTitle(x ? '✏️ Modifica sezione' : '➕ Nuova sezione').addComponents(
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('titolo').setLabel('Titolo').setStyle(TextInputStyle.Short).setMaxLength(256).setRequired(false).setValue(x?.titolo ?? '')),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('testo').setLabel('Testo (puoi andare a capo)').setStyle(TextInputStyle.Paragraph).setMaxLength(4000).setRequired(true).setValue(x?.testo ?? '')),
  );

  async function handle(i) {
    if (!i.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) return i.reply({ content: '❌ Non hai i permessi.', flags: EPH });
    if (i.isChatInputCommand()) return i.reply({ ...pannello(i.guild), flags: EPH });
    const g = i.guild; const w = get(g.id);
    const [a, b, id] = i.customId.split(':');
    const fatto = async (avviso) => {
      save();
      if (lunghezza(w) > 6000) return i.update(pannello(g, `${avviso}\n⚠️ Non aggiorno il messaggio: il testo supera 6000 caratteri.`));
      const ok = w.pubblicato ? await aggiorna(g) : true;
      return i.update(pannello(g, ok ? avviso : `${avviso}\n⚠️ Non trovo più il messaggio: ripubblicalo dal menu 📢.`));
    };
    if (a === prefisso) {
      if (b === 'modifica') { const x = w.sezioni.find((y) => y.id === i.values[0]); return x ? i.showModal(modalSezione(x)) : i.update(pannello(g)); }
      if (b === 'aggiungi') return i.showModal(modalSezione(null));
      if (b === 'elimina') { w.sezioni = w.sezioni.filter((y) => y.id !== i.values[0]); return fatto('🗑️ Sezione eliminata.'); }
      if (b === 'ripristina') { w.sezioni = structuredClone(sezioni).map((x) => ({ ...x, id: nuovoId() })); return fatto('🔄 Testi originali ripristinati.'); }
      if (b === 'pubblica') {
        try { await pubblica(g, i.values[0]); return i.update(pannello(g, `✅ Pubblicato in <#${i.values[0]}>.`)); } catch (e) { return i.update(pannello(g, `❌ Non posso scrivere in <#${i.values[0]}>: ${e.message}`)); }
      }
    }
    if (a === `${prefisso}m` && b === 'sez') {
      const dati = { titolo: i.fields.getTextInputValue('titolo').trim(), testo: i.fields.getTextInputValue('testo').trim() };
      if (id) Object.assign(w.sezioni.find((y) => y.id === id) ?? {}, dati);
      else w.sezioni.push({ id: nuovoId(), ...dati });
      return fatto('✅ Sezione salvata.');
    }
  }

  // All'avvio: se non è ancora pubblicato lo pubblica nel suo canale, altrimenti lo aggiorna
  async function onReady(guild) {
    const w = get(guild.id);
    if (w.pubblicato) return aggiorna(guild);
    if (!guild.channels.cache.has(w.canale)) return null;
    try { await pubblica(guild, w.canale); console.log(`📋 ${nome} pubblicato`); } catch (e) { console.warn(`[${chiave}] ${e.message}`); }
    return null;
  }

  const re = new RegExp(`^${prefisso}m?:`);
  return {
    init(c, s) { cfg = c; save = s; },
    command: new SlashCommandBuilder().setName(comando).setDescription(descrizioneComando)
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild).setDMPermission(false).toJSON(),
    is: (i) => (i.isChatInputCommand() && i.commandName === comando) || re.test(i.customId ?? ''),
    handle, onReady,
    _pannello: pannello, _messaggio: messaggio, _get: get, _lunghezza: lunghezza,
  };
}

// ---------- INFO LAVORI ----------
const lavori = creaInfo({
  chiave: 'infoLavori',
  prefisso: 'lv',
  comando: 'lavori-info',
  descrizioneComando: 'Modifica il messaggio con le informazioni sui lavori',
  nome: '💼 Info Lavori – VICE LIFE🌴',
  canale: '1575153854235017348',
  footer: 'VICE LIFE RP 🌴 • Lavori',
  sezioni: [
    {
      titolo: '💼 LAVORI – VICE LIFE RP',
      testo: 'In città ci sono tanti modi per guadagnare e costruire la tua carriera.\nQui trovi **quali lavori esistono**, **come ottenerli** e le **regole** da rispettare.\n\nRicorda: il lavoro fa parte del tuo **personaggio**. Scegli quello che si adatta meglio alla sua storia! 🌴',
    },
    {
      titolo: '🏛️ Lavori pubblici (fazioni)',
      testo: '🚓 **Polizia** – mantiene l\'ordine, fa indagini e arresti\n🚑 **Ospedale / EMS** – soccorre e cura i cittadini\n⚖️ **Avvocati e giustizia** – difesa e processi\n🏛️ **Governo / Comune** – leggi, tasse e documenti\n\n📝 Per entrare serve una **candidatura**: apri un **ticket** e segui le istruzioni dello staff. Potrebbe esserci un colloquio.',
    },
    {
      titolo: '🔧 Lavori privati',
      testo: '🔧 **Meccanico** – riparazioni, modifiche e soccorso stradale\n🚕 **Tassista** – trasporto dei cittadini in città\n🚚 **Camionista** – consegne e trasporti merci\n🍔 **Ristorazione** – bar, ristoranti e locali\n🏠 **Agente immobiliare** – vendita e affitto di case\n🏢 **Imprenditore** – apri e gestisci la tua attività',
    },
    {
      titolo: '⛏️ Lavori liberi',
      testo: 'Alcuni lavori si possono fare **senza candidatura**: ti basta andare al punto di lavoro in città (pesca, raccolta, minatore, ecc.).\nSono perfetti per iniziare e mettere da parte i primi soldi! 💸',
    },
    {
      titolo: '🕶️ Attività illegali',
      testo: 'Le attività illegali fanno parte del RP, ma vanno fatte **con criterio**:\n• Servono una **storia** e un **motivo RP** credibili\n• Rispetta sempre **Fear RP**, **valore della vita** e le regole del server\n• Le **organizzazioni** si creano solo con l\'**approvazione dello staff**',
    },
    {
      titolo: '📜 Regole dei lavori',
      testo: '• Niente **AFK farming**: lavora solo se sei davvero presente\n• Non usare i mezzi e gli strumenti di lavoro per **scopi personali**\n• In servizio rispetta **divisa** e **comportamento** del tuo ruolo\n• Non abusare dei **bug**: se ne trovi uno, segnalalo con un **ticket**\n• Puoi avere **un solo lavoro di fazione** alla volta\n\n❓ Dubbi? Apri un **ticket** e lo staff ti aiuterà!',
    },
  ],
});

// ---------- INFO OFFERTE DI LAVORO ----------
const offerte = creaInfo({
  chiave: 'infoOfferte',
  prefisso: 'of',
  comando: 'offerte-info',
  descrizioneComando: 'Modifica il messaggio informativo del canale offerte di lavoro',
  nome: '📢 Info Offerte di Lavoro – VICE LIFE🌴',
  canale: '1575153879665086514',
  footer: 'VICE LIFE RP 🌴 • Offerte di lavoro',
  sezioni: [
    {
      titolo: '📢 OFFERTE DI LAVORO – VICE LIFE RP',
      testo: 'In questo canale trovi le **offerte di lavoro** della città: fazioni, aziende e attività che cercano **nuovo personale**.\n\nTieni d\'occhio il canale: le offerte possono uscire in qualsiasi momento! 👀',
    },
    {
      titolo: '📝 Com\'è fatta un\'offerta',
      testo: 'Ogni offerta contiene:\n🏢 **Chi cerca** – fazione, azienda o attività\n💼 **Ruolo** – il lavoro offerto\n📋 **Requisiti** – cosa serve per candidarsi\n💰 **Stipendio / guadagni** – se indicati\n📞 **Come candidarsi** – ticket, colloquio o contatto in gioco\n⏰ **Scadenza** – fino a quando si accettano candidature',
    },
    {
      titolo: '✅ Come candidarti',
      testo: '1️⃣ Leggi bene **requisiti** e **scadenza** dell\'offerta\n2️⃣ Segui le istruzioni scritte nell\'offerta (di solito un **ticket** o un **colloquio in gioco**)\n3️⃣ Presentati **in RP**: il colloquio lo fa il tuo personaggio!\n4️⃣ Aspetta la risposta di chi ha pubblicato l\'offerta\n\n🍀 Più sei serio e preciso, più possibilità hai di essere scelto.',
    },
    {
      titolo: '🏢 Vuoi pubblicare un\'offerta?',
      testo: 'Se gestisci una **fazione**, un\'**azienda** o un\'**attività** e cerchi personale, apri un **ticket** e lo staff pubblicherà la tua offerta in questo canale.\n\nScrivi nel ticket: chi sei, che ruolo cerchi, requisiti, stipendio, come candidarsi e scadenza.',
    },
    {
      titolo: '📜 Regole del canale',
      testo: '• Le offerte le pubblica **solo lo staff**\n• Non scrivere in questo canale: per domande apri un **ticket**\n• Niente offerte **false** o per **scherzo**\n• Le offerte di **attività illegali** non vanno pubblicate qui: si gestiscono **in gioco**',
    },
  ],
});

module.exports = { creaInfo, lavori, offerte };
