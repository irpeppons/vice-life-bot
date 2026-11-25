# VICE LIFE🌴 – Bot Discord RP

## Funzioni
| Comando | Cosa fa |
|---|---|
| `/lista [nome]` | Crea una categoria in cima al server con i contatori (stile ServerStats): 👥 Membri, 👤 Cittadini, 🤖 Bot, 🚀 Boost. Si aggiornano da soli. |
| `/rimuovi-lista` | Elimina la categoria statistiche. |
| `/benvenuto` | Apre il **pannello** del benvenuto: scegli il canale, modifichi testi, colore, banner e miniatura con anteprima dal vivo, lo attivi o disattivi e invii una prova. |

Variabili utilizzabili nei testi: `{user}` (menzione), `{username}`, `{server}`, `{membri}`.

| `/ticket` | Pannello per creare il sistema ticket (pannello pubblico, tipi, categorie, staff). |
| `/autoruoli` | Ruoli dati in automatico a chi entra. |
| `/idfissi` · `/id` | Numero fisso nel nickname in base all'ordine di ingresso. |

## Aggiornamenti automatici
All'avvio e ogni 5 minuti il bot controlla questo repository GitHub: se c'è una versione nuova scarica i file e si riavvia da solo (serve avviarlo con `AVVIA.bat`). Non vengono mai toccati `.env`, `data.json`, `sfondi/` e i file `.bat`.

## Installazione
1. Vai su https://discord.com/developers/applications → **New Application** → chiamala `VICE LIFE🌴`.
2. Scheda **Bot** → **Reset Token** e copia il token. Attiva **SERVER MEMBERS INTENT** (obbligatorio).
3. Scheda **OAuth2 → URL Generator**: spunta `bot` + `applications.commands`, permessi `Manage Channels`, `View Channels`, `Send Messages`, `Embed Links`, `Connect`. Apri il link e invita il bot.
4. Sul PC (serve [Node.js](https://nodejs.org) 18+):
   ```
   npm install
   cp .env.example .env      # poi inserisci il token (e l'ID del server in GUILD_ID)
   npm start
   ```
5. Nel server, il ruolo del bot deve stare **sopra** gli altri ruoli che vuoi gestire.

Per tenerlo acceso 24/7 usa un hosting (VPS, Railway, ecc.) oppure `pm2 start index.js --name vicelife`.

Nota: Discord permette di rinominare un canale solo 2 volte ogni 10 minuti, quindi i contatori si aggiornano al massimo ogni 10 minuti.
