// ================================================
//   VICE LIFE🌴  -  MEMORIA RUOLI
//   Salva i ruoli (e il nickname) di ogni player. Se esce e rientra
//   nel Discord gli vengono rimessi in automatico.
// ================================================
let cfg; let save;

const store = (gid) => (cfg(gid).memoria ??= {});
const attiva = (gid) => cfg(gid).memoriaAttiva !== false;

function leggi(member) {
  return {
    ruoli: member.roles.cache.filter((r) => r.id !== member.guild.id && !r.managed).map((r) => r.id),
    nick: member.nickname?.replace(/^\d+ \| /, '') ?? null, // senza il numero della fila d'attesa
  };
}

// Salva i ruoli di un player (non quando i dati sono incompleti)
function salva(member, scrivi = true) {
  if (member.user?.bot || member.partial) return;
  store(member.guild.id)[member.id] = leggi(member);
  if (scrivi) save();
}

// All'avvio salva tutti i membri già presenti
function salvaTutti(guild) {
  guild.members.cache.forEach((m) => salva(m, false));
  save();
}

// Quando rientra: rimette i ruoli salvati e restituisce il vecchio nickname
async function ripristina(member) {
  if (member.user.bot || !attiva(member.guild.id)) return null;
  const dati = store(member.guild.id)[member.id];
  if (!dati) return null;
  const me = member.guild.members.me;
  const ruoli = dati.ruoli.filter((id) => {
    const r = member.guild.roles.cache.get(id);
    return r && !r.managed && me && r.position < me.roles.highest.position;
  });
  const bloccati = dati.ruoli.length - ruoli.length;
  if (ruoli.length) {
    try {
      await member.roles.add(ruoli, 'Ripristino ruoli VICE LIFE');
      console.log(`♻️  ${member.user.username} è rientrato: rimessi ${ruoli.length} ruoli`);
    } catch (e) {
      console.warn(`❌ [memoria] ${member.user.username}: ${e.message}`);
    }
  }
  if (bloccati) console.warn(`⚠️ [memoria] ${bloccati} ruoli di ${member.user.username} non rimessi: non esistono più o stanno SOPRA il ruolo del bot`);
  return dati.nick;
}

module.exports = {
  init(cfgFn, saveFn) { cfg = cfgFn; save = saveFn; },
  salva, salvaTutti, ripristina, attiva,
  // true se il player era già stato nel server (ha ruoli salvati)
  conosciuto: (member) => attiva(member.guild.id) && Boolean(store(member.guild.id)[member.id]),
  toggle(gid) { cfg(gid).memoriaAttiva = !attiva(gid); save(); return attiva(gid); },
};
