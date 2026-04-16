# Adunata

Una piattaforma web per giocatori di **Magic: The Gathering**. Sfoglia carte, costruisci mazzi, testa prime pescate e gioca partite 1v1 con amici, il tutto installabile come app su telefono e desktop.

Dominio di produzione: **[adunata.vercel.app](https://adunata.vercel.app)** (o il tuo dominio custom su Vercel)

---

## Cos'è Adunata

Adunata nasce con un'idea semplice: **dare ai giocatori di MTG un posto dove organizzare i propri mazzi e giocarli con gli amici senza installare nulla**. Non è un simulatore pieno di regole automatiche. È più vicino a un tavolo virtuale condiviso: tu e il tuo avversario gestite le carte, i punti vita e i segnalini, il sistema scandisce fasi, pescate, mulligan e ricorda lo stato della partita.

### Cosa puoi fare subito

- **Cercare** qualsiasi carta Magic del catalogo Scryfall (oltre 30.000 carte), con filtri per colore, tipo, rarità, CMC e set.
- **Costruire mazzi** in quattro sezioni: Main, Sideboard, Maybeboard, **Token** (i token vengono mostrati in partita nel bottone "Create Token").
- **Importare** decklist in formato MTGO / Moxfield / Archidekt (incolli il testo e ritrovi il mazzo pronto).
- **Esportare** i mazzi in più formati, o stamparli in PDF come **proxy** in A4 (9 carte per pagina).
- **Provare la pescata** in modalità *Goldfish* contro il bot Ghost: London Mulligan completo, fasi, turni, vita, zone.
- **Giocare 1v1** con un amico tramite lobby con codice condivisibile. Stato sincronizzato in tempo reale via Supabase.
- **Community**: pagina profilo pubblica, mazzi pubblici, ricerca utenti, cronologia partite.

### Cosa NON fa (per scelta)

- Non arbitra le regole complesse (priorità speciali, stack, effetti sostituzione). Le regole le applichi tu, come al tavolo.
- Non ha ranking ELO, tornei o matchmaking. Si gioca con amici tramite codice lobby.
- Non scarica le immagini localmente: le serve Scryfall. Se sei offline, funziona solo la navigazione delle pagine già visitate.

---

## Guida rapida per nuovi utenti

1. **Registrati** con email + password (o Google). Riceverai una mail di conferma.
2. **Profilo**: scegli uno `username` (serve per l'URL pubblico `/u/tuoNome`) e, se vuoi, un `display name`.
3. **Carte**: naviga su *Cards* per cercare tra le 30k+ carte. Long-press (o tasto destro) su una carta per aprire il dettaglio con tutte le edizioni e i prezzi.
4. **Deck**: *Decks → New deck*, scegli il formato, poi:
   - usa la barra di ricerca per aggiungere carte,
   - oppure *Import* e incolla una decklist in formato testuale,
   - i **token** si aggiungono dalla tab "Tokens" cercandoli per nome — saranno disponibili poi in partita nel menu "Create Token".
5. **Goldfish**: dal mazzo → bottone *Goldfish*. Testa la pescata, il mulligan (London), la prima mano.
6. **Gioca**: *Play → Create lobby*, scegli mazzo e formato, condividi il codice con un amico. Chi arriva per secondo inserisce il codice e si parte.

---

## Gesti e controlli (cheat sheet)

Adunata è mobile-first. Gli stessi gesti funzionano ovunque (card browser, deck editor, tavolo di gioco).

| Azione | Desktop | Mobile |
|---|---|---|
| **Eseguire l'azione primaria** (giocare una carta, tapparla, aggiungere al deck) | Click sinistro | Tap |
| **Anteprima / dettaglio carta** (immagine grande + azioni contestuali) | Click destro | Long-press (~500ms) |
| **Scorrere una lista di carte** | Rotella / trackpad | Swipe |
| **Uscire da una modale / anteprima** | `Esc` o click sullo sfondo | Tap sullo sfondo |
| **Ingrandire il campo avversario** | Click sulla freccia "Expand" | Tap sulla freccia "Expand" |
| **Collassare la sidebar** (desktop) | Bottone *Collapse* in basso a sinistra | — |

**Regola pratica**: il tap/click fa una cosa rapida. Il long-press / tasto destro apre il pannello con tutte le azioni possibili (gioca, tappa, sposta in cimitero, in esilio, in mano, sopra/sotto al mazzo, ecc.) e mostra l'immagine grande.

Il long-press è stato scelto apposta perché il tasto destro su mobile non esiste. Il delay è ~500ms: se tieni premuto un attimo, si apre il pannello; se fai tap veloce, fa l'azione primaria.

---

## FAQ

### Generali

**Dove sono ospitati i miei dati?**
Su Supabase (PostgreSQL). Le tue credenziali non le vediamo mai: sono gestite dall'auth di Supabase con hash bcrypt.

**Posso installare Adunata come app?**
Sì. Su iOS: Safari → *Condividi → Aggiungi alla schermata Home*. Su Android: Chrome → menu → *Installa app*. Funziona poi come una PWA standalone, con splash screen e icona. Le pagine già visitate restano consultabili offline.

**Adunata è gratis?**
Sì. Il progetto gira su tier gratuiti di Supabase + Vercel. Non esiste un piano a pagamento.

### Carte e mazzi

**Come faccio a importare un deck da Moxfield / Archidekt / MTGO?**
*Decks → apri il mazzo → Import*. Incolla la lista testuale (formato `4 Lightning Bolt`, con tag `// Sideboard` e `// Maybeboard` opzionali). Il server fa lookup batch nel DB locale e, per le carte mancanti, scarica da Scryfall al volo.

**Come si aggiungono i token al mazzo?**
Nel deck editor, tab **Tokens**, cerca il nome (es. "Soldier", "Treasure", "Zombie"). Il token viene salvato come qualsiasi altra carta nella sezione Tokens. In partita lo ritrovi nel bottone **Special → Create Token**, già pronto con immagine, P/T e colori.

**Il proxy PDF è utilizzabile per tornei?**
No, il proxy PDF è pensato per testare mazzi in casual. Ogni tournament organizer ha le proprie regole sui proxy.

**I prezzi sono in EUR o USD?**
Entrambi. EUR viene da **Cardmarket**, USD da **TCGPlayer**. Aggiornati ogni settimana via cron.

### Gioco

**Come gioco una partita con un amico?**
*Play → Create lobby → scegli mazzo e formato*. Copia il codice lobby e mandalo. L'amico apre *Play → Join lobby*, incolla il codice, sceglie il suo mazzo e si avvia.

**Non si applicano le regole avanzate — è normale?**
Sì, per scelta. Adunata gestisce fasi, turni, pescate, mulligan, vita, zone (mano, battlefield, cimitero, esilio, command zone). Il resto (trigger, stack, priorità su singole risoluzioni) lo gestite voi a voce, come al tavolo.

**Si può giocare da soli contro il bot?**
Sì, con la modalità **Goldfish**. Pensata per testare l'apertura e la prima parte del mazzo, non per un avversario vero.

**Ho chiuso la pagina in mezzo a una partita. È persa?**
No. Lo stato della partita è salvato su Supabase. Riapri la lobby e ritrovi tutto.

### Tecniche

**Perché la prima volta che cerco una carta nuova ci mette un attimo?**
Se la carta non è ancora nel DB locale, la scarichiamo da Scryfall al volo e la cacheriamo. Dalle volte successive è istantanea.

**Il sito mi sembra lento su mobile.**
Segnalalo aprendo una issue. Adunata ha loading.tsx e data parallelization aggressivi; se qualcosa rallenta è probabilmente un regresso.

---

## Setup per sviluppatori

### Prerequisiti

- Node.js 20+
- Account Supabase ([supabase.com](https://supabase.com))
- Account Vercel ([vercel.com](https://vercel.com)) per il deploy

### Installazione locale

```bash
git clone https://github.com/GioviDipla/adunata.git
cd adunata
npm install
cp .env.local.example .env.local   # poi compila le variabili
npm run dev
```

### Variabili d'ambiente

| Variabile | Dove si prende |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | stessa pagina, key pubblica |
| `SUPABASE_SERVICE_ROLE_KEY` | stessa pagina, key privata (server-only) |
| `CRON_SECRET` | stringa casuale, protegge gli endpoint `/api/cron/*` |

### Caricare il catalogo Scryfall

```bash
curl -X POST -H "Authorization: Bearer $CRON_SECRET" \
  http://localhost:3000/api/sync-cards
```

Scarica ~30k carte oracle (~170MB). Per forzare un re-sync: `?force=true`.

### Deploy

Push su `main` → Vercel fa deploy automatico. Il file `vercel.json` configura il cron mensile di sync carte e quello settimanale per i prezzi.

---

## Stack tecnologico

| Layer | Tecnologia |
|---|---|
| Framework | Next.js 16 (App Router) |
| Runtime | Node.js 24, Fluid Compute su Vercel |
| Styling | Tailwind CSS v4 (design system dark-themed) |
| Database | Supabase (PostgreSQL + RLS) |
| Auth | Supabase Auth (email/password + Google OAuth) |
| Realtime | Supabase Realtime (canali postgres_changes) |
| Storage | Scryfall diretto (nessun Blob Vercel necessario) |
| PWA | Service worker custom + manifest |
| Hosting | Vercel |
| Card Data | Scryfall bulk API |

---

## Struttura del progetto

```
src/
├── app/
│   ├── (auth)/                 login / register
│   ├── (app)/                  area autenticata
│   │   ├── about/              pagina info (linkata dalla sidebar)
│   │   ├── cards/              card browser
│   │   ├── dashboard/          home utente
│   │   ├── decks/              deck list + editor + goldfish
│   │   ├── play/               lobby + game live
│   │   ├── profile/            profilo utente
│   │   ├── u/[username]/       profilo pubblico
│   │   └── users/              ricerca community
│   └── api/                    route handler (cards, decks, game, cron, ...)
├── components/
│   ├── cards/                  card browser + detail
│   ├── deck/                   editor, import/export, proxy PDF
│   ├── goldfish/               zone del tavolo goldfish
│   ├── play/                   PlayGame (multiplayer + goldfish shared)
│   └── ui/                     Button, Input, ecc.
├── lib/
│   ├── game/                   engine delle fasi, azioni, tipi GameState
│   ├── hooks/                  useLongPress, ecc.
│   ├── supabase/               client / server / admin / middleware
│   └── scryfall.ts             lookup API
└── types/
    └── supabase.ts             tipi del database
```

---

## Documenti correlati

- [`DECISIONS.md`](./DECISIONS.md) — log delle scelte architetturali (utile per capire il "perché")
- [`MANUAL_STEPS.md`](./MANUAL_STEPS.md) — passi di setup esterno ancora aperti
- [`CHECKPOINT.md`](./CHECKPOINT.md) — stato corrente delle feature
- [`CLAUDE.md`](./CLAUDE.md) — istruzioni operative per agenti AI che lavorano sulla repo
- [`AGENTS.md`](./AGENTS.md) — disclaimer Next.js 16

---

## License

MIT
