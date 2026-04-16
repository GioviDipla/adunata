import Link from 'next/link'
import {
  Sparkles,
  Layers,
  Swords,
  Fish,
  Users,
  MousePointerClick,
  Hand,
  ArrowRight,
} from 'lucide-react'

export const metadata = {
  title: 'Info — Adunata',
  description: 'Cos\u2019\u00e8 Adunata e come usarla',
}

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:py-10">
      {/* Header */}
      <div className="mb-8 flex items-center gap-3">
        <Sparkles className="h-7 w-7 shrink-0 text-font-accent" />
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-font-primary">Adunata</h1>
          <p className="text-sm text-font-secondary">
            Una piattaforma per giocatori di Magic: The Gathering.
          </p>
        </div>
      </div>

      {/* Intro */}
      <section className="mb-8 rounded-xl border border-border bg-bg-surface p-4 sm:p-6">
        <h2 className="mb-2 text-lg font-semibold text-font-primary">Cos&apos;&egrave; Adunata</h2>
        <p className="text-sm leading-relaxed text-font-secondary">
          Adunata &egrave; un posto dove organizzi i tuoi mazzi di Magic e li giochi con gli amici,
          senza installare nulla. Non arbitra le regole complesse del gioco: &egrave; pi&ugrave;
          vicino a un <strong>tavolo virtuale condiviso</strong>, dove tu e il tuo avversario gestite
          carte, vita e segnalini, mentre il sistema scandisce fasi, pescate, mulligan e tiene
          sincronizzato lo stato della partita in tempo reale.
        </p>
      </section>

      {/* Feature grid */}
      <section className="mb-8">
        <h2 className="mb-3 text-lg font-semibold text-font-primary">Cosa puoi fare</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <FeatureCard
            icon={Layers}
            title="Costruire mazzi"
            body="Main, Sideboard, Maybeboard e Token. Importi decklist in formato MTGO/Moxfield/Archidekt, stampi proxy PDF, switchi tra stampe diverse di una carta."
          />
          <FeatureCard
            icon={Fish}
            title="Goldfish"
            body="Testi la pescata contro il bot Ghost. London Mulligan completo, fasi, turni, zone: tutto come in partita vera."
          />
          <FeatureCard
            icon={Swords}
            title="1v1 con un amico"
            body="Crei una lobby con codice condivisibile. Stato sincronizzato in tempo reale, chat, Create Token dal menu Special."
          />
          <FeatureCard
            icon={Users}
            title="Community"
            body="Profilo pubblico su /u/tuonome, mazzi pubblici, ricerca utenti, cronologia partite."
          />
        </div>
      </section>

      {/* Gesture cheat sheet */}
      <section className="mb-8 rounded-xl border border-border bg-bg-surface p-4 sm:p-6">
        <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold text-font-primary">
          <MousePointerClick className="h-5 w-5 text-font-accent" /> Gesti e controlli
        </h2>
        <p className="mb-4 text-sm text-font-secondary">
          Stessa regola ovunque: <strong>tap/click</strong> per l&apos;azione rapida,{' '}
          <strong>long-press (mobile)</strong> o <strong>tasto destro (desktop)</strong> per aprire
          l&apos;anteprima con tutte le azioni contestuali.
        </p>
        <div className="overflow-x-auto rounded-lg border border-border/50">
          <table className="w-full text-left text-xs sm:text-sm">
            <thead className="bg-bg-cell">
              <tr>
                <th className="px-3 py-2 font-semibold text-font-secondary">Azione</th>
                <th className="px-3 py-2 font-semibold text-font-secondary">Desktop</th>
                <th className="px-3 py-2 font-semibold text-font-secondary">Mobile</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              <GestureRow action="Giocare / tappare / aggiungere al deck" desktop="Click sinistro" mobile="Tap" />
              <GestureRow
                action="Anteprima carta + azioni contestuali"
                desktop="Tasto destro"
                mobile="Long-press (~500ms)"
              />
              <GestureRow action="Scorrere liste" desktop="Rotella / trackpad" mobile="Swipe" />
              <GestureRow action="Uscire da una modale" desktop="Esc o click sullo sfondo" mobile="Tap sullo sfondo" />
              <GestureRow action="Ingrandire campo avversario" desktop="Freccia Expand" mobile="Freccia Expand" />
              <GestureRow action="Collassare sidebar" desktop="Bottone Collapse in basso" mobile="\u2014" />
            </tbody>
          </table>
        </div>
        <p className="mt-3 flex items-start gap-2 text-xs text-font-muted">
          <Hand className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            Il long-press &egrave; stato scelto apposta perch&eacute; il tasto destro su mobile non
            esiste. Tieni premuto circa mezzo secondo per aprire il pannello; tap veloce = azione
            diretta.
          </span>
        </p>
      </section>

      {/* FAQ */}
      <section className="mb-8">
        <h2 className="mb-3 text-lg font-semibold text-font-primary">FAQ</h2>
        <div className="space-y-2">
          <FaqItem
            q="Posso installare Adunata come app sul telefono?"
            a="S\u00ec. Su iOS apri Safari \u2192 Condividi \u2192 Aggiungi alla schermata Home. Su Android usa Chrome \u2192 menu \u2192 Installa app. Funziona come PWA con splash screen e icona."
          />
          <FaqItem
            q="Adunata \u00e8 gratis?"
            a="S\u00ec. Il progetto gira su tier gratuiti di Supabase + Vercel. Nessun piano a pagamento."
          />
          <FaqItem
            q="Come importo un deck da Moxfield / Archidekt / MTGO?"
            a="Dentro un mazzo premi Import e incolla la decklist testuale. I tag // Sideboard e // Maybeboard sono supportati. Le carte mancanti vengono scaricate al volo da Scryfall."
          />
          <FaqItem
            q="Come si aggiungono i token al mazzo?"
            a="Nel deck editor, tab Tokens, cerca il nome (es. Soldier, Treasure, Zombie). Il token viene salvato come qualsiasi altra carta, e in partita lo trovi nel menu Special \u2192 Create Token gi\u00e0 pronto con immagine e P/T."
          />
          <FaqItem
            q="I prezzi sono in EUR o USD?"
            a="Entrambi. EUR viene da Cardmarket, USD da TCGPlayer. Aggiornati settimanalmente via cron."
          />
          <FaqItem
            q="Come gioco una partita con un amico?"
            a="Play \u2192 Create lobby, scegli mazzo e formato. Copia il codice e mandalo all'amico, che fa Play \u2192 Join lobby e lo incolla."
          />
          <FaqItem
            q="Non si applicano le regole avanzate \u2014 \u00e8 normale?"
            a="S\u00ec, per scelta. Adunata gestisce fasi, turni, pescate, mulligan, vita e zone. Il resto (trigger, stack, priorit\u00e0 su singole risoluzioni) lo gestite voi a voce, come al tavolo."
          />
          <FaqItem
            q="Ho chiuso la pagina in mezzo a una partita. \u00c8 persa?"
            a="No. Lo stato della partita \u00e8 salvato su Supabase. Riapri la lobby e ritrovi tutto."
          />
          <FaqItem
            q="Perch\u00e9 la prima volta che cerco una carta nuova ci mette un attimo?"
            a="Se la carta non \u00e8 ancora nel DB locale, la scarichiamo da Scryfall al volo e la cacheriamo. Dalla seconda volta \u00e8 istantanea."
          />
        </div>
      </section>

      {/* CTA */}
      <section className="rounded-xl border border-bg-accent/40 bg-bg-accent/5 p-4 sm:p-6">
        <h2 className="mb-2 text-lg font-semibold text-font-primary">Inizia da qui</h2>
        <p className="mb-4 text-sm text-font-secondary">
          Se sei appena arrivato, il percorso tipico &egrave;: profilo &rarr; primo mazzo &rarr;
          goldfish &rarr; prima partita con un amico.
        </p>
        <div className="flex flex-wrap gap-2">
          <CtaLink href="/profile" label="Completa profilo" />
          <CtaLink href="/decks" label="Crea un mazzo" />
          <CtaLink href="/cards" label="Sfoglia carte" />
          <CtaLink href="/play" label="Nuova partita" />
        </div>
      </section>

      <footer className="mt-10 border-t border-border pt-4 text-center text-xs text-font-muted">
        Adunata &mdash; open source su{' '}
        <a
          href="https://github.com/GioviDipla/adunata"
          className="text-font-accent hover:underline"
          target="_blank"
          rel="noopener noreferrer"
        >
          GitHub
        </a>
      </footer>
    </div>
  )
}

function FeatureCard({
  icon: Icon,
  title,
  body,
}: {
  icon: typeof Layers
  title: string
  body: string
}) {
  return (
    <div className="rounded-xl border border-border bg-bg-surface p-4">
      <div className="mb-2 flex items-center gap-2">
        <Icon className="h-4 w-4 text-font-accent" />
        <h3 className="text-sm font-semibold text-font-primary">{title}</h3>
      </div>
      <p className="text-xs leading-relaxed text-font-secondary">{body}</p>
    </div>
  )
}

function GestureRow({ action, desktop, mobile }: { action: string; desktop: string; mobile: string }) {
  return (
    <tr>
      <td className="px-3 py-2 text-font-primary">{action}</td>
      <td className="px-3 py-2 text-font-secondary">{desktop}</td>
      <td className="px-3 py-2 text-font-secondary">{mobile}</td>
    </tr>
  )
}

function FaqItem({ q, a }: { q: string; a: string }) {
  return (
    <details className="group rounded-lg border border-border bg-bg-surface open:bg-bg-cell/40">
      <summary className="flex cursor-pointer items-center justify-between px-4 py-3 text-sm font-medium text-font-primary marker:content-none">
        <span>{q}</span>
        <ArrowRight className="h-4 w-4 shrink-0 text-font-muted transition-transform group-open:rotate-90" />
      </summary>
      <div className="border-t border-border px-4 py-3 text-sm leading-relaxed text-font-secondary">
        {a}
      </div>
    </details>
  )
}

function CtaLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1 rounded-lg bg-bg-accent px-3 py-1.5 text-xs font-medium text-font-white transition-colors hover:bg-bg-accent-dark"
    >
      {label} <ArrowRight className="h-3.5 w-3.5" />
    </Link>
  )
}
