// ================================================
//   VICE LIFE🌴  -  AUDIO SALA D'ATTESA ASSISTENZA
//   Quando chiunque entra nel canale vocale d'attesa (anche lo staff), il bot gli fa
//   sentire un audio ("uno staff sarà presto disponibile").
//   Discord non permette di far sentire un audio a UNA sola persona dentro
//   un canale, quindi il bot sposta il player per pochi secondi in un canale
//   privato temporaneo, gli fa sentire l'audio e lo riporta nell'attesa.
// ================================================
const fs = require('fs');
const path = require('path');
const { ChannelType, PermissionFlagsBits } = require('discord.js');

const CANALE_ATTESA = '1575152185891627168';
const AUDIO = path.join(__dirname, 'audio', 'attesa-assistenza.ogg');
const ATTESA_PRIMA_MS = 2500; // pausa prima dell'audio
const SENZA_SUONI = [PermissionFlagsBits.UseSoundboard, PermissionFlagsBits.UseExternalSounds];
let cfg; let save;
let voice; // @discordjs/voice (caricato solo quando serve)

function libVoce() {
  if (voice) return voice;
  try { voice = require('@discordjs/voice'); } catch {
    console.log('⏳ Installo la libreria per l\'audio (solo la prima volta)...');
    require('child_process').execSync('npm install --no-audit --no-fund', { cwd: path.join(__dirname), stdio: 'inherit' });
    voice = require('@discordjs/voice');
  }
  return voice;
}

const inCorso = new Set();      // player che stanno ascoltando l'audio
const inAttesaAudio = new Set(); // player in coda per sentire l'audio
const rientri = new Set();      // player che il bot sta riportando nell'attesa (da non rifare)
const coda = new Map();         // una riproduzione alla volta per server
const attivi = new Map();       // player -> { temp, player, uscito } mentre sente l'audio

// ---------- FILA: numero davanti al nome finché resta in attesa ----------
const PREFISSO = /^\d+ \| /;            // es. "1 | irPEPPON$ [0002]"
const file = new Map();                   // server -> [id dei player in ordine di arrivo]
const catene = new Map();                 // una modifica dei nickname alla volta
const fila = (gid) => (file.has(gid) ? file.get(gid) : file.set(gid, []).get(gid));
const senzaNumero = (nick) => (nick ?? '').replace(PREFISSO, '');
const rinominabile = (m) => m && m.manageable && m.id !== m.guild.ownerId;

async function metti_nick(m, nick) {
  if (!rinominabile(m)) return;
  const nuovo = nick && nick !== (m.user.globalName ?? m.user.username) ? nick.slice(0, 32) : null;
  if ((m.nickname ?? null) !== nuovo) await m.setNickname(nuovo, 'Fila attesa assistenza').catch(() => {});
}

// Rimette i numeri giusti a tutti quelli in fila (1 = arrivato per primo)
function aggiornaFila(guild, tolto = null) {
  const prima = catene.get(guild.id) ?? Promise.resolve();
  const dopo = prima.then(async () => {
    if (tolto) await metti_nick(tolto, senzaNumero(tolto.nickname ?? tolto.displayName));
    const lista = fila(guild.id);
    for (let n = 0; n < lista.length; n++) {
      const m = guild.members.cache.get(lista[n]);
      if (!m) continue;
      const base = senzaNumero(m.nickname ?? m.displayName);
      const voluto = `${n + 1} | ${base}`;
      if (m.nickname !== voluto) await metti_nick(m, voluto);
    }
  }).catch(() => {});
  catene.set(guild.id, dopo);
  return dopo;
}

function entraInFila(member) {
  const lista = fila(member.guild.id);
  if (!lista.includes(member.id)) { lista.push(member.id); aggiornaFila(member.guild); }
}
function esceDallaFila(member) {
  const lista = fila(member.guild.id);
  const i = lista.indexOf(member.id);
  if (i === -1) return;
  lista.splice(i, 1);
  aggiornaFila(member.guild, member);
}
const temporanei = (gid) => (cfg(gid).canaliAudio ??= []);


async function riproduci(member) {
  const g = member.guild;
  const attesa = g.channels.cache.get(CANALE_ATTESA);
  if (!attesa || member.voice.channelId !== CANALE_ATTESA) return;
  const v = libVoce();
  let temp; let conn;
  const stato = { uscito: false, player: null, temp: null };
  inCorso.add(member.id);
  attivi.set(member.id, stato);
  try {
    // 1) canale privato: solo il player e il bot
    const perms = [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak];
    temp = await g.channels.create({
      name: `🔊 ${member.displayName}`.slice(0, 90),
      type: ChannelType.GuildVoice,
      parent: attesa.parentId ?? null,
      userLimit: 2,
      permissionOverwrites: [
        // niente soundboard e suoni d'ingresso personalizzati: si sente solo l'audio del bot
        { id: g.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect, ...SENZA_SUONI] },
        { id: member.id, allow: perms, deny: SENZA_SUONI },
        { id: g.members.me.id, allow: [...perms, PermissionFlagsBits.MoveMembers, PermissionFlagsBits.ManageChannels] },
      ],
    });
    stato.temp = temp.id;
    temporanei(g.id).push(temp.id); save();

    // 2) il bot entra, poi sposta il player
    conn = v.joinVoiceChannel({ channelId: temp.id, guildId: g.id, adapterCreator: g.voiceAdapterCreator, selfDeaf: true });
    await v.entersState(conn, v.VoiceConnectionStatus.Ready, 10_000);
    if (stato.uscito || member.voice.channelId !== CANALE_ATTESA) { stato.uscito = true; return; } // è uscito nel frattempo
    await member.voice.setChannel(temp, 'Audio sala d\'attesa');
    // aspetta che finisca il suono di Discord dello spostamento, così l'audio si sente bene
    await new Promise((r) => setTimeout(r, ATTESA_PRIMA_MS));
    if (stato.uscito) return; // è uscito durante la pausa

    // 3) audio
    const player = v.createAudioPlayer();
    stato.player = player;
    conn.subscribe(player);
    player.play(v.createAudioResource(fs.createReadStream(AUDIO), { inputType: v.StreamType.OggOpus }));
    await v.entersState(player, v.AudioPlayerStatus.Playing, 10_000);
    await v.entersState(player, v.AudioPlayerStatus.Idle, 30_000);
    console.log(stato.uscito ? `🔇 ${member.user.username} è uscito durante l'audio` : `🔊 Audio d'attesa fatto sentire a ${member.user.username}`);
  } catch (e) {
    console.warn(`[audio] ${member.user.username}: ${e.message}`);
  } finally {
    // 4) lo riporta nell'attesa SOLO se è ancora nel canale privato (se è uscito lo lascia andare)
    try {
      const dove = g.voiceStates.cache.get(member.id)?.channelId;
      if (!stato.uscito && temp && dove === temp.id) {
        rientri.add(member.id);
        await member.voice.setChannel(CANALE_ATTESA, 'Fine audio sala d\'attesa').catch(() => {});
        setTimeout(() => rientri.delete(member.id), 5000);
      }
    } catch { /* niente */ }
    try { conn?.destroy(); } catch { /* niente */ }
    attivi.delete(member.id);
    if (temp) {
      await new Promise((r) => setTimeout(r, 1500)); // lascia a Discord il tempo di spostarlo prima di cancellare
      await temp.delete().catch(() => {});
      const lista = temporanei(g.id); lista.splice(lista.indexOf(temp.id), 1); save();
    }
    inCorso.delete(member.id);
  }
}

// Chiamato da index.js a ogni cambio di stato vocale
function onVoiceUpdate(oldState, newState) {
  const member = newState.member;
  if (!member || member.user.bot) return;
  // Fila: entra quando arriva in attesa, esce quando va da un'altra parte (il canale privato dell'audio non conta)
  const tempAudio = attivi.get(member.id)?.temp;
  if (newState.channelId === CANALE_ATTESA) entraInFila(member);
  else if (!(tempAudio && newState.channelId === tempAudio)) esceDallaFila(member);
  // Se esce (o cambia canale) mentre sente l'audio: stop subito, il bot non lo riprende
  const a = attivi.get(member.id);
  if (a && newState.channelId !== a.temp && (oldState.channelId === a.temp || newState.channelId !== CANALE_ATTESA)) {
    a.uscito = true;
    try { a.player?.stop(true); } catch { /* niente */ }
    return;
  }
  if (newState.channelId !== CANALE_ATTESA || oldState.channelId === CANALE_ATTESA) return;
  if (rientri.has(member.id)) return; // è il bot che lo sta riportando
  if (inAttesaAudio.has(member.id)) return; // è già in coda per sentirlo
  if (inCorso.has(member.id) && !attivi.get(member.id)?.uscito) return; // lo sta già sentendo
  if (!fs.existsSync(AUDIO)) { console.warn('[audio] File audio mancante: audio/attesa-assistenza.ogg'); return; }
  console.log(`🔊 ${member.user.username} è entrato in attesa: gli faccio sentire l'audio`);
  metti(member);
}

// una riproduzione alla volta: gli altri aspettano il loro turno
function metti(member) {
  const gid = member.guild.id;
  inAttesaAudio.add(member.id);
  const prima = coda.get(gid) ?? Promise.resolve();
  const dopo = prima.then(() => { inAttesaAudio.delete(member.id); return riproduci(member); }).catch(() => {});
  coda.set(gid, dopo);
}

// All'avvio cancella eventuali canali temporanei rimasti, toglie i numeri rimasti
// e rifà la fila con chi è già in attesa
async function onReady(guild) {
  const lista = temporanei(guild.id);
  for (const id of [...lista]) await guild.channels.cache.get(id)?.delete().catch(() => {});
  cfg(guild.id).canaliAudio = [];
  save();
  const inAttesa = guild.channels.cache.get(CANALE_ATTESA)?.members;
  for (const m of guild.members.cache.values()) {
    if (PREFISSO.test(m.nickname ?? '') && !inAttesa?.has(m.id)) await metti_nick(m, senzaNumero(m.nickname));
  }
  file.set(guild.id, [...(inAttesa?.values() ?? [])].filter((m) => !m.user.bot).map((m) => m.id));
  await aggiornaFila(guild);
}

// /test-audio: per provare l'audio anche se sei staff (devi essere nel canale d'attesa)
const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const command = new SlashCommandBuilder().setName('test-audio').setDescription('Prova l\'audio della sala d\'attesa (entra prima nel vocale d\'attesa)')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild).setDMPermission(false).toJSON();
async function handle(i) {
  if (i.member.voice.channelId !== CANALE_ATTESA) {
    return i.reply({ content: `🔇 Prima entra nel canale vocale <#${CANALE_ATTESA}>, poi usa di nuovo \`/test-audio\`.`, flags: MessageFlags.Ephemeral });
  }
  if (inCorso.has(i.member.id)) return i.reply({ content: '⏳ Stai già sentendo l\'audio.', flags: MessageFlags.Ephemeral });
  await i.reply({ content: '🔊 Ti sposto un attimo nel canale privato e ti faccio sentire l\'audio...', flags: MessageFlags.Ephemeral });
  metti(i.member);
}

module.exports = {
  init(cfgFn, saveFn) { cfg = cfgFn; save = saveFn; },
  onVoiceUpdate, onReady, libVoce, command, handle, PREFISSO,
  isVoce: (i) => i.isChatInputCommand() && i.commandName === 'test-audio',
};
