import Link from 'next/link'
import { FileText, ArrowLeft } from 'lucide-react'

export const metadata = {
  title: 'Termini di servizio — Adunata',
  description: 'Termini di servizio di Adunata',
}

const LAST_UPDATED = '20 aprile 2026'

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-bg-dark">
      <div className="mx-auto max-w-3xl px-4 py-8 sm:py-12">
        <Link
          href="/"
          className="mb-6 inline-flex items-center gap-1.5 text-sm text-font-muted transition-colors hover:text-font-accent"
        >
          <ArrowLeft className="h-4 w-4" /> Torna alla home
        </Link>

        <div className="mb-6 flex items-center gap-3">
          <FileText className="h-7 w-7 shrink-0 text-font-accent" />
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-font-primary">Termini di servizio</h1>
            <p className="text-xs text-font-muted">Ultimo aggiornamento: {LAST_UPDATED}</p>
          </div>
        </div>

        <div className="space-y-6 rounded-xl border border-border bg-bg-surface p-5 sm:p-7 text-sm leading-relaxed text-font-secondary">
          <Section title="1. Accettazione dei termini">
            <p>
              Usando <strong>Adunata</strong> (
              <a
                href="https://adunata.studiob35.com"
                className="text-font-accent hover:underline"
              >
                adunata.studiob35.com
              </a>
              ) accetti questi termini. Se non sei d&apos;accordo, non usare il servizio.
            </p>
          </Section>

          <Section title="2. Cos'è Adunata">
            <p>
              Adunata è una piattaforma gratuita che ti permette di costruire mazzi di{' '}
              <em>Magic: The Gathering</em>, testarli in modalità goldfish e giocare partite 1v1 con
              altri utenti. Non è un prodotto ufficiale di Wizards of the Coast e non è affiliato a
              Wizards of the Coast, Scryfall, Cardmarket o TCGPlayer.
            </p>
          </Section>

          <Section title="3. Account utente">
            <p>
              Per usare la maggior parte delle funzionalità devi accedere con un account Google.
              Sei responsabile di mantenere la sicurezza del tuo account Google. Non puoi usare
              Adunata per conto di altre persone senza il loro consenso.
            </p>
          </Section>

          <Section title="4. Comportamenti ammessi">
            <p>Usando Adunata ti impegni a:</p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>non caricare contenuti illegali, offensivi, molesti o fraudolenti</li>
              <li>non usare il servizio per disturbare altri utenti (spam, bot, harassment)</li>
              <li>non tentare di aggirare i meccanismi di sicurezza o fare reverse-engineering</li>
              <li>non sovraccaricare intenzionalmente l&apos;infrastruttura (scraping massivo, DoS)</li>
            </ul>
            <p className="mt-3">
              Possiamo sospendere o chiudere account che violano questi termini senza preavviso.
            </p>
          </Section>

          <Section title="5. Proprietà intellettuale di Magic: The Gathering">
            <p>
              I nomi delle carte, le illustrazioni, i simboli di mana e l&apos;ambientazione di
              Magic: The Gathering sono proprietà di <strong>Wizards of the Coast LLC</strong>.
              Adunata è un progetto fatto da fan (fan content) e ne fa uso a scopo informativo e di
              gioco non commerciale. Le immagini e i dati delle carte sono forniti tramite{' '}
              <a
                href="https://scryfall.com"
                className="text-font-accent hover:underline"
                target="_blank"
                rel="noopener noreferrer"
              >
                Scryfall
              </a>
              .
            </p>
          </Section>

          <Section title="6. Proxy PDF">
            <p>
              Adunata permette di esportare un PDF proxy del tuo mazzo. Le proxy generate sono
              destinate esclusivamente a uso privato e playtesting. Non sono carte da gioco
              ufficiali e non possono essere vendute, scambiate o usate in tornei ufficiali.
            </p>
          </Section>

          <Section title="7. Disponibilità del servizio">
            <p>
              Adunata è un progetto personale offerto gratuitamente &ldquo;as-is&rdquo;. Non
              garantiamo uptime del 100%, assenza di bug o conservazione illimitata dei dati. Ci
              riserviamo il diritto di modificare, sospendere o chiudere il servizio in qualsiasi
              momento. In caso di chiusura proveremo a notificare gli utenti con ragionevole
              preavviso.
            </p>
          </Section>

          <Section title="8. Limitazione di responsabilità">
            <p>
              Nei limiti di legge, Adunata non è responsabile per perdite di dati, mancati guadagni
              o danni indiretti derivanti dall&apos;uso del servizio. Usi Adunata a tuo rischio.
            </p>
          </Section>

          <Section title="9. Modifiche ai termini">
            <p>
              Possiamo aggiornare questi termini. La data in cima indica l&apos;ultima revisione.
              Se i cambiamenti sono sostanziali cercheremo di avvisarti in-app o via email prima
              della loro entrata in vigore.
            </p>
          </Section>

          <Section title="10. Contatti">
            <p>
              Per qualsiasi questione relativa a questi termini:{' '}
              <a href="mailto:gidippi@gmail.com" className="text-font-accent hover:underline">
                gidippi@gmail.com
              </a>
              .
            </p>
          </Section>
        </div>

        <footer className="mt-8 text-center text-xs text-font-muted">
          <Link href="/privacy" className="text-font-accent hover:underline">
            Privacy Policy
          </Link>{' '}
          &middot;{' '}
          <a href="mailto:gidippi@gmail.com" className="text-font-accent hover:underline">
            Contattaci
          </a>
        </footer>
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-2 text-base font-semibold text-font-primary">{title}</h2>
      {children}
    </section>
  )
}
