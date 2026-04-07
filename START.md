Leggi il file CLAUDE.md prima di fare qualsiasi cosa. Poi costruisci integralmente il progetto descritto di seguito.

---

# The Gathering — Prompt per Claude Opus 4.6

---

Voglio che tu progetti e costruisca dall'inizio, in modo completamente autonomo, una piattaforma web chiamata **The Gathering**.

È un'applicazione per giocatori di Magic: The Gathering. Prima di scrivere una sola riga di codice, voglio che tu ragioni sull'architettura complessiva, scelga lo stack più adatto agli obiettivi che ti descrivo, e mi proponga un piano strutturato. Per il front end ci sono già degli esempi per la versione mobile (src e tailwind.config.ts), creati con pencil.ai e di cui hai anche il file.pen se puoi servirti. Poi implementa tutto, step by step, senza chiedermi conferme intermedie.
La repo deve poi essere caricata su GitHub. 

---

## Cosa deve fare la piattaforma

### Identità e accesso
Gli utenti si registrano con email e password e accedono a un proprio spazio personale. L'autenticazione deve essere sicura, moderna e scalabile. Ogni utente vede solo i propri dati.

### Database carte
La piattaforma deve integrare il catalogo completo di Magic: The Gathering, attingendo a Scryfall come fonte dati, scaricando in locale tutti i dati delle carte (formato immagine small). Voglio che le carte siano consultabili, ricercabili per nome e testo, filtrabili per colore, tipo, rarità, costo di mana e set di appartenenza. Il database deve aggiornarsi automaticamente una volta al mese per recepire le nuove uscite e aggiornare il database locale. Se in fase di import di una decklist una o piu carte non sono presenti nel database locale, scaricale e aggiungile al database locale.

### Gestione deck
Ogni utente può creare più mazzi, importarli incollando una lista in formato testuale standard (il formato usato da MTGO, Moxfield, Archidekt), modificarli aggiungendo o rimuovendo carte, eliminarli ed esportarli. Ogni mazzo deve mostrare statistiche complete: distribuzione dei tipi di carta, curva di mana, colori, valore economico stimato basato sui prezzi di mercato, CMC medio.
modalità goldfish per la prima pescata e il mulligan. 

### Esperienza utente
L'app deve funzionare perfettamente su browser desktop e su mobile. Deve essere installabile come applicazione dalla schermata home di iOS e Android, senza passare dagli store, e deve funzionare anche in assenza di connessione per i contenuti già visitati. In futuro vogliamo poterla pubblicare anche su Google Play Store e Apple App Store: tienilo in conto nelle scelte architetturali.

### Hosting e infrastruttura
Voglio che tutto giri su Supabase + Vercel: hosting, database, storage, autenticazione delle sessioni e il job di sincronizzazione mensile. L'obiettivo è che il costo operativo sia zero o minimo nella fase iniziale, con la possibilità di scalare in futuro. Il deploy deve essere automatico a ogni aggiornamento del codice, sul branch MAIN della repo. 

---

## Cosa deve poter diventare

Questa è la parte più importante sul lungo periodo. La piattaforma deve essere progettata fin dall'inizio con in mente due funzionalità future che potrebbero arrivare in una seconda fase, ma che non devono richiedere una riscrittura dell'architettura quando arriverà il momento.

### Matchmaking tra utenti
Gli utenti registrati devono poter trovare altri giocatori con cui fare una partita, creando delle lobby con codice a cui accedere. L'idea è semplice: un utente pubblica la disponibilità a giocare, specifica il formato e il mazzo che intende usare, e invia il codice della lobby agli amici. Niente di complesso come un ELO o un sistema di ranking elaborato in questa fase: basta che due o piu giocatori possano trovarsi e accordarsi per una partita.
L'app deve solo scandire le regole base del gioco: fasi del turno, prima pescata e mulligan, drag and drop delle carte dalla mano alle varie sezioni del battlefield. 

### Tavolo virtuale semplificato
Non voglio un simulatore completo con regole automatizzate: voglio uno spazio condiviso dove i due giocatori vedono il proprio campo e quello dell'avversario, possono pescare carte dal proprio mazzo, spostarle in gioco, nel cimitero, nell'esilio, tenere traccia dei punti vita e dei segnalini. Le regole le applicano i giocatori stessi, come farebbero al tavolo. Il sistema è una lavagna condivisa in tempo reale, non un arbitro automatico.
L'app deve solo scandire le regole base del gioco: fasi del turno, prima pescata e mulligan, drag and drop delle carte dalla mano alle varie sezioni del battlefield. 

---

## Come voglio che tu proceda

Inizia con una proposta architetturale chiara: stack, struttura del progetto, scelte infrastrutturali, e una spiegazione del perché hai fatto quelle scelte in funzione degli obiettivi che ti ho descritto, incluse le funzionalità future. Aspetta la mia approvazione su questa proposta prima di iniziare a scrivere codice.

Una volta approvata l'architettura, implementa il progetto in step sequenziali, ciascuno verificabile e funzionante prima di passare al successivo. Sii esplicito su cosa stai facendo a ogni step e su cosa l'utente deve fare manualmente (es. creare account su servizi esterni, copiare chiavi API).

Il codice deve essere pulito, ben organizzato e commentato dove necessario. Nessun placeholder, nessun file incompleto.

---

Inizia subito. Non chiedere nulla. Lavora in autonomia completa seguendo le istruzioni in CLAUDE.md.
