import Link from 'next/link'
import { Shield, ArrowLeft } from 'lucide-react'

export const metadata = {
  title: 'Privacy Policy — Adunata',
  description: 'Privacy Policy di Adunata',
}

const LAST_UPDATED = '20 aprile 2026'

export default function PrivacyPage() {
  return (
    <div
      className="min-h-screen bg-bg-dark"
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
    >
      <div className="mx-auto max-w-3xl px-4 py-8 sm:py-12">
        <Link
          href="/"
          className="mb-6 inline-flex items-center gap-1.5 text-sm text-font-muted transition-colors hover:text-font-accent"
        >
          <ArrowLeft className="h-4 w-4" /> Torna alla home
        </Link>

        <div className="mb-6 flex items-center gap-3">
          <Shield className="h-7 w-7 shrink-0 text-font-accent" />
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-font-primary">Privacy Policy</h1>
            <p className="text-xs text-font-muted">Ultimo aggiornamento: {LAST_UPDATED}</p>
          </div>
        </div>

        <div className="space-y-6 rounded-xl border border-border bg-bg-surface p-5 sm:p-7 text-sm leading-relaxed text-font-secondary">
          <Section title="1. Chi siamo">
            <p>
              <strong>Adunata</strong> è un&apos;applicazione web gratuita per giocatori di{' '}
              <em>Magic: The Gathering</em>, accessibile su{' '}
              <a
                href="https://adunata.studiob35.com"
                className="text-font-accent hover:underline"
              >
                adunata.studiob35.com
              </a>
              . Il progetto è gestito a titolo personale da Giovanni Di Placido. Per qualsiasi
              richiesta relativa a questa policy puoi scriverci a{' '}
              <a href="mailto:gidippi@gmail.com" className="text-font-accent hover:underline">
                gidippi@gmail.com
              </a>
              .
            </p>
          </Section>

          <Section title="2. Quali dati raccogliamo">
            <p>Quando accedi con Google (Sign in with Google) riceviamo:</p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>il tuo indirizzo email Google</li>
              <li>il tuo nome e la foto profilo associati all&apos;account Google</li>
              <li>un identificatore univoco Google (sub) per mantenere la tua sessione</li>
            </ul>
            <p className="mt-3">
              Inoltre, durante l&apos;utilizzo dell&apos;app salviamo i dati che crei tu stesso:
              username scelto, mazzi, liste carte, cronologia partite, messaggi chat nelle lobby.
            </p>
          </Section>

          <Section title="3. Come usiamo i tuoi dati">
            <ul className="list-disc space-y-1 pl-5">
              <li>per autenticarti e mantenere la tua sessione attiva</li>
              <li>per mostrare il tuo nome e avatar su profilo pubblico, lobby e partite</li>
              <li>per consentire ai tuoi avversari di vedere chi sei durante una partita 1v1</li>
              <li>per salvare i tuoi mazzi e le partite così da poterli riprendere dopo</li>
            </ul>
            <p className="mt-3">
              <strong>Non vendiamo i tuoi dati.</strong> Non li condividiamo con inserzionisti né li
              usiamo per profilazione pubblicitaria. Non inviamo email promozionali.
            </p>
          </Section>

          <Section title="4. Dove sono conservati">
            <p>
              I dati sono conservati su <strong>Supabase</strong> (database PostgreSQL gestito, con
              server in Europa) e l&apos;applicazione è servita da <strong>Vercel</strong>. Scryfall
              fornisce i dati pubblici delle carte Magic — quando visualizzi una carta, la richiesta
              può passare dai loro server.
            </p>
          </Section>

          <Section title="5. Cookie e sessione">
            <p>
              Utilizziamo cookie tecnici essenziali per mantenere la sessione di login (gestiti da
              Supabase Auth). Non usiamo cookie di tracciamento né analytics di terze parti.
            </p>
          </Section>

          <Section title="6. I tuoi diritti">
            <p>
              Puoi in qualsiasi momento:
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>
                revocare l&apos;accesso di Adunata al tuo account Google da{' '}
                <a
                  href="https://myaccount.google.com/permissions"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-font-accent hover:underline"
                >
                  myaccount.google.com/permissions
                </a>
              </li>
              <li>
                richiedere la cancellazione completa del tuo account e dei relativi dati scrivendo a{' '}
                <a href="mailto:gidippi@gmail.com" className="text-font-accent hover:underline">
                  gidippi@gmail.com
                </a>
              </li>
              <li>richiedere una copia dei tuoi dati tramite la stessa email</li>
            </ul>
          </Section>

          <Section title="7. Minori">
            <p>
              Adunata non è rivolta a minori di 13 anni. Se scopriamo che un account è stato creato
              da un minore di 13 anni lo elimineremo.
            </p>
          </Section>

          <Section title="8. Modifiche a questa policy">
            <p>
              Potremmo aggiornare questa policy nel tempo. La data in cima a questa pagina indica
              l&apos;ultima revisione. Se ci sono cambiamenti sostanziali riguardo l&apos;uso dei
              tuoi dati, ti avviseremo in-app o via email.
            </p>
          </Section>
        </div>

        <footer className="mt-8 text-center text-xs text-font-muted">
          <Link href="/terms" className="text-font-accent hover:underline">
            Termini di servizio
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
