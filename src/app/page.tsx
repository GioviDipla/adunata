import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  Layers,
  Swords,
  Fish,
  Users,
  ArrowRight,
} from "lucide-react";

export const metadata = {
  title: "Adunata — piattaforma per giocatori di Magic: The Gathering",
  description:
    "Adunata è una web app gratuita per costruire mazzi di Magic: The Gathering, fare goldfish e giocare partite 1v1 in tempo reale con gli amici.",
};

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    redirect("/dashboard");
  }

  return (
    <div
      className="min-h-screen bg-bg-dark text-font-primary"
      style={{ paddingTop: "env(safe-area-inset-top)" }}
    >
      <main>
        <section className="relative isolate overflow-hidden px-4 pb-6 pt-52 text-center sm:px-6 sm:pb-8 sm:pt-64 lg:pb-10 lg:pt-72">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 -z-20 bg-[length:100%_auto] bg-top bg-no-repeat opacity-80 saturate-110 sm:bg-cover sm:opacity-80"
            style={{
              backgroundImage: "url('/icons/logo-full.png')",
            }}
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 -z-10"
            style={{
              background:
                "linear-gradient(180deg, rgba(18,18,24,0.02) 0%, rgba(18,18,24,0.14) 18%, rgba(18,18,24,0.46) 44%, rgba(18,18,24,0.78) 68%, #121218 100%)",
            }}
          />
          <div className="mx-auto max-w-5xl">
            <h1
              className="mb-5 text-3xl font-bold leading-tight sm:text-6xl"
              style={{ textShadow: "0 3px 24px rgba(0,0,0,0.72)" }}
            >
              La piattaforma per giocatori di{" "}
              <span className="text-font-accent">Magic: The Gathering</span>
            </h1>
            <p
              className="mx-auto mb-8 max-w-2xl text-base leading-relaxed text-font-primary/85 sm:text-lg"
              style={{ textShadow: "0 2px 18px rgba(0,0,0,0.78)" }}
            >
              Costruisci i tuoi mazzi, testali in goldfish contro un bot, sfida i
              tuoi amici in partite 1v1 sincronizzate in tempo reale. Tutto dal
              browser, senza installare nulla. Gratis.
            </p>
            <div className="flex flex-wrap justify-center gap-3">
              <Link
                href="/login"
                className="inline-flex items-center gap-2 rounded-lg bg-bg-accent px-5 py-2.5 text-sm font-medium text-font-white shadow-lg shadow-black/30 transition-colors hover:bg-bg-accent-dark"
              >
                Inizia ora <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/privacy"
                className="inline-flex items-center gap-2 rounded-lg border border-font-white/15 bg-bg-dark/55 px-5 py-2.5 text-sm font-medium text-font-primary backdrop-blur-sm transition-colors hover:bg-bg-cell/80"
              >
                Informativa privacy
              </Link>
            </div>
          </div>
        </section>

        <div className="mx-auto max-w-5xl px-4 pb-10 pt-4 sm:pb-16 sm:pt-6">
          <section className="mb-14">
            <h2 className="mb-6 text-center text-xl font-semibold sm:text-2xl">
              Cosa puoi fare con Adunata
            </h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <Feature
                icon={Layers}
                title="Costruire mazzi"
                body="Main deck, sideboard, maybeboard e token. Importa decklist da Moxfield, Archidekt o MTGO. Esporta proxy PDF pronti per il playtest."
              />
              <Feature
                icon={Fish}
                title="Goldfish solitario"
                body="Testa la pescata del tuo mazzo contro Ghost, il bot. London Mulligan, fasi, turni, zone: tutto come in una partita vera."
              />
              <Feature
                icon={Swords}
                title="1v1 in tempo reale"
                body="Crea una lobby con codice condivisibile, invita un amico, giocate sincronizzati live. Chat integrata e gestione token."
              />
              <Feature
                icon={Users}
                title="Community"
                body="Profilo pubblico, mazzi condivisibili, ricerca giocatori, cronologia partite. Scopri come giocano gli altri."
              />
            </div>
          </section>

          <section className="mb-14 rounded-xl border border-border bg-bg-surface p-6 sm:p-8">
            <h2 className="mb-3 text-xl font-semibold sm:text-2xl">
              Come funziona
            </h2>
            <p className="mb-4 text-sm leading-relaxed text-font-secondary sm:text-base">
              Adunata è un tavolo virtuale condiviso. Il sistema scandisce fasi,
              pescate, mulligan e tiene sincronizzato lo stato di gioco; le regole
              complesse (trigger, stack, risoluzioni) le gestite tu e il tuo
              avversario come al tavolo vero. Accedi con il tuo account Google,
              costruisci un mazzo, manda il codice lobby a un amico e giocate.
            </p>
            <ol className="list-decimal space-y-1 pl-5 text-sm text-font-secondary">
              <li>Accedi con Google</li>
              <li>Crea o importa un mazzo</li>
              <li>Provalo in Goldfish</li>
              <li>Crea una lobby e invita un amico</li>
            </ol>
          </section>

          <section className="rounded-xl border border-bg-accent/40 bg-bg-accent/5 p-6 text-center sm:p-8">
            <h2 className="mb-2 text-xl font-semibold sm:text-2xl">
              Pronto a partire?
            </h2>
            <p className="mb-5 text-sm text-font-secondary">
              Accesso gratuito con il tuo account Google. Niente carta di credito.
            </p>
            <Link
              href="/login"
              className="inline-flex items-center gap-2 rounded-lg bg-bg-accent px-5 py-2.5 text-sm font-medium text-font-white transition-colors hover:bg-bg-accent-dark"
            >
              Accedi con Google <ArrowRight className="h-4 w-4" />
            </Link>
          </section>
        </div>
      </main>

      <footer className="border-t border-border/50">
        <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-3 px-4 py-6 text-xs text-font-muted sm:flex-row">
          <span>© {new Date().getFullYear()} Adunata</span>
          <nav className="flex items-center gap-4">
            <Link
              href="/privacy"
              className="hover:text-font-accent hover:underline"
            >
              Privacy Policy
            </Link>
            <Link
              href="/terms"
              className="hover:text-font-accent hover:underline"
            >
              Termini di servizio
            </Link>
            <a
              href="mailto:gidippi@gmail.com"
              className="hover:text-font-accent hover:underline"
            >
              Contatti
            </a>
          </nav>
        </div>
      </footer>
    </div>
  );
}

function Feature({
  icon: Icon,
  title,
  body,
}: {
  icon: typeof Layers;
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-bg-surface p-5">
      <div className="mb-2 flex items-center gap-2">
        <Icon className="h-5 w-5 text-font-accent" />
        <h3 className="text-base font-semibold">{title}</h3>
      </div>
      <p className="text-sm leading-relaxed text-font-secondary">{body}</p>
    </div>
  );
}
