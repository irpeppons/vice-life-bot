// ================================================
//   VICE LIFE🌴  -  PARTNERSHIP
//   /partner -> pubblica un server partner nel canale partnership
//   (logo, nome, descrizione e pulsante con il link Discord).
//   Lo può usare solo il ruolo partner manager.
// ================================================
const {
  ChannelType, MessageFlags, EmbedBuilder, SlashCommandBuilder, AttachmentBuilder,
  ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle,
} = require('discord.js');

const EPH = MessageFlags.Ephemeral;
const CANALE_PARTNER = '1575189693493018776';
const RUOLO_PARTNER = '1575144736015261774';
const ROSA = '#ff2d95';
const inAttesa = new Map();

const linkValido = (s) => /^https:\/\/(discord\.gg|discord\.com\/invite|www\.discord\.com\/invite)\/[\w-]+\/?$/i.test(s);

const modal = (nome) => new ModalBuilder().setCustomId('ptm').setTitle('🤝 Nuova partnership').addComponents(
  new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('nome').setLabel('Nome del server partner').setStyle(TextInputStyle.Short)
    .setMaxLength(100).setRequired(true).setValue(nome ?? '')),
  new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('descrizione').setLabel('Descrizione (puoi andare a capo)').setStyle(TextInputStyle.Paragraph)
    .setMaxLength(3500).setRequired(true).setPlaceholder('Di cosa parla il server, cosa offre, perché entrare...')),
);

async function handle(i) {
  if (!i.member?.roles?.cache?.has(RUOLO_PARTNER)) {
    return i.reply({ content: `❌ Solo chi ha il ruolo <@&${RUOLO_PARTNER}> può pubblicare le partnership.`, flags: EPH, allowedMentions: { parse: [] } });
  }
  if (i.isChatInputCommand()) {
    const logo = i.options.getAttachment('logo');
    const link = i.options.getString('link').trim();
    if (!logo.contentType?.startsWith('image/')) return i.reply({ content: '❌ Il logo deve essere un\'immagine (png, jpg, gif...).', flags: EPH });
    if (!linkValido(link)) return i.reply({ content: '❌ Il link deve essere un invito Discord, per esempio `https://discord.gg/abc123`.', flags: EPH });
    inAttesa.set(i.user.id, { logo: { url: logo.url, nome: logo.name }, link });
    return i.showModal(modal(i.options.getString('nome')));
  }
  if (i.customId === 'ptm') {
    const dati = inAttesa.get(i.user.id);
    if (!dati) return i.reply({ content: '⚠️ Tempo scaduto, rifai `/partner`.', flags: EPH });
    inAttesa.delete(i.user.id);
    await i.deferReply({ flags: EPH });
    const nome = i.fields.getTextInputValue('nome').trim();
    const descrizione = i.fields.getTextInputValue('descrizione').trim();
    const est = (dati.logo.nome.match(/\.(png|jpe?g|gif|webp)$/i)?.[1] ?? 'png').toLowerCase();
    const file = `logo-partner.${est}`;
    const e = new EmbedBuilder().setColor(ROSA)
      .setAuthor({ name: '🤝 NUOVA PARTNERSHIP', iconURL: i.guild.iconURL() ?? undefined })
      .setTitle(nome.slice(0, 256))
      .setURL(dati.link)
      .setDescription(descrizione.slice(0, 4096))
      .setThumbnail(`attachment://${file}`)
      .addFields({ name: '🔗 Link Discord', value: dati.link })
      .setFooter({ text: `VICE LIFE RP 🌴 • Partnership pubblicata da ${i.user.username}` })
      .setTimestamp();
    const bottone = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setStyle(ButtonStyle.Link).setURL(dati.link).setLabel(`Entra in ${nome}`.slice(0, 80)).setEmoji('🤝'),
    );
    try {
      const ch = await i.guild.channels.fetch(CANALE_PARTNER);
      // il logo viene ricaricato nel messaggio, così non sparisce col tempo
      const msg = await ch.send({ embeds: [e], files: [new AttachmentBuilder(dati.logo.url, { name: file })], components: [bottone] });
      return i.editReply(`✅ Partnership con **${nome}** pubblicata: ${msg.url}`);
    } catch (err) {
      return i.editReply(`❌ Non riesco a pubblicare in <#${CANALE_PARTNER}>: ${err.message}`);
    }
  }
}

module.exports = {
  command: new SlashCommandBuilder().setName('partner').setDescription('Pubblica un server partner nel canale partnership')
    .addAttachmentOption((o) => o.setName('logo').setDescription('Il logo del server partner').setRequired(true))
    .addStringOption((o) => o.setName('link').setDescription('Invito Discord del partner (https://discord.gg/...)').setRequired(true))
    .addStringOption((o) => o.setName('nome').setDescription('Nome del server partner (puoi scriverlo anche dopo)'))
    .setDMPermission(false).toJSON(),
  isPartner: (i) => (i.isChatInputCommand() && i.commandName === 'partner') || i.customId === 'ptm',
  handle,
  _modal: modal, _linkValido: linkValido,
};
