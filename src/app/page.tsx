import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  Layers,
  Swords,
  Fish,
  Users,
  ArrowRight,
  Sparkles,
  MessageCircle,
  Search,
  BookOpen,
  Zap,
  ShieldCheck,
} from "lucide-react";

export const metadata = {
  title: "Adunata — piattaforma per giocatori di Magic: The Gathering",
  description:
    "Adunata è una web app gratuita per costruire mazzi di Magic: The Gathering, fare goldfish e giocare partite 1v1 in tempo reale con gli amici. Con GoblinAI, l'assistente IA per le regole di MTG.",
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
    <>
      <style>{`
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(24px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes glowPulse {
          0%, 100% { box-shadow: 0 0 40px rgba(234,179,8,0.12), 0 0 80px rgba(234,179,8,0.04); }
          50% { box-shadow: 0 0 60px rgba(234,179,8,0.22), 0 0 120px rgba(234,179,8,0.08); }
        }
        @keyframes goblinGlow {
          0%, 100% { box-shadow: 0 0 30px rgba(34,197,94,0.10), 0 0 60px rgba(34,197,94,0.03); }
          50% { box-shadow: 0 0 50px rgba(34,197,94,0.20), 0 0 100px rgba(34,197,94,0.06); }
        }
        @keyframes float {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-6px); }
        }
        @keyframes shimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
        @keyframes borderGlow {
          0%, 100% { border-color: rgba(234,179,8,0.15); }
          50% { border-color: rgba(234,179,8,0.35); }
        }
        .animate-fade-in-up { animation: fadeInUp 0.7s ease-out both; }
        .animate-fade-in { animation: fadeIn 0.5s ease-out both; }
        .animate-glow-pulse { animation: glowPulse 3s ease-in-out infinite; }
        .animate-goblin-glow { animation: goblinGlow 2.5s ease-in-out infinite; }
        .animate-float { animation: float 4s ease-in-out infinite; }
        .animate-shimmer {
          background: linear-gradient(90deg, transparent 0%, rgba(234,179,8,0.08) 50%, transparent 100%);
          background-size: 200% 100%;
          animation: shimmer 3s ease-in-out infinite;
        }
        .hero-card {
          border: 1px solid rgba(234,179,8,0.15);
          box-shadow: 0 0 40px rgba(234,179,8,0.06), inset 0 0 40px rgba(234,179,8,0.02);
        }
        .goblin-card {
          border: 1px solid rgba(34,197,94,0.20);
          box-shadow: 0 0 50px rgba(34,197,94,0.08), inset 0 0 50px rgba(34,197,94,0.02);
        }
        .feature-card {
          border: 1px solid rgba(46,46,62,0.6);
          transition: border-color 0.3s ease, box-shadow 0.3s ease, transform 0.3s ease;
        }
        .feature-card:hover {
          border-color: rgba(234,179,8,0.25);
          box-shadow: 0 8px 32px rgba(0,0,0,0.3);
          transform: translateY(-2px);
        }
        .stagger-1 { animation-delay: 0.1s; }
        .stagger-2 { animation-delay: 0.2s; }
        .stagger-3 { animation-delay: 0.3s; }
        .stagger-4 { animation-delay: 0.4s; }
        .stagger-5 { animation-delay: 0.5s; }
        .stagger-6 { animation-delay: 0.6s; }
        .noise-overlay::before {
          content: '';
          position: absolute;
          inset: 0;
          opacity: 0.03;
          background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
          background-size: 200px 200px;
          pointer-events: none;
          z-index: 1;
        }
        .ornament-left, .ornament-right {
          position: absolute;
          top: 50%;
          transform: translateY(-50%);
          width: 1px;
          height: 60%;
          background: linear-gradient(to bottom, transparent, rgba(234,179,8,0.3), transparent);
          pointer-events: none;
        }
        .ornament-left { left: -1px; }
        .ornament-right { right: -1px; }
        .goblin-ornament-left, .goblin-ornament-right {
          position: absolute;
          top: 50%;
          transform: translateY(-50%);
          width: 1px;
          height: 60%;
          background: linear-gradient(to bottom, transparent, rgba(34,197,94,0.3), transparent);
          pointer-events: none;
        }
        .goblin-ornament-left { left: -1px; }
        .goblin-ornament-right { right: -1px; }
        .radial-bg {
          background:
            radial-gradient(ellipse 80% 60% at 50% 0%, rgba(234,179,8,0.04) 0%, transparent 60%),
            radial-gradient(ellipse 60% 40% at 30% 20%, rgba(59,130,246,0.03) 0%, transparent 50%),
            radial-gradient(ellipse 50% 30% at 70% 15%, rgba(34,197,94,0.03) 0%, transparent 50%);
        }
        .goblin-radial {
          background:
            radial-gradient(ellipse 60% 50% at 50% 50%, rgba(34,197,94,0.06) 0%, transparent 70%),
            radial-gradient(ellipse 40% 30% at 30% 40%, rgba(234,179,8,0.03) 0%, transparent 60%);
        }
        @media (prefers-reduced-motion: reduce) {
          .animate-fade-in-up, .animate-fade-in, .animate-float, .animate-shimmer {
            animation: none;
          }
        }
      `}</style>

      <div className="min-h-screen bg-bg-dark text-font-primary radial-bg" style={{ paddingTop: "env(safe-area-inset-top)" }}>
        <main>
          {/* ── Hero ── */}
          <section className="relative isolate overflow-hidden px-4 pb-8 pt-28 text-center sm:px-6 sm:pb-12 sm:pt-44 lg:pb-16 lg:pt-56">
            {/* Background layers */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 -z-30 bg-[length:100%_auto] bg-top bg-no-repeat opacity-50 sm:bg-cover sm:opacity-55"
              style={{ backgroundImage: "url('/icons/logo-full.png')" }}
            />
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 -z-20"
              style={{
                background:
                  "linear-gradient(180deg, rgba(18,18,24,0.0) 0%, rgba(18,18,24,0.08) 12%, rgba(18,18,24,0.30) 35%, rgba(18,18,24,0.60) 55%, #121218 85%)",
              }}
            />
            {/* Golden glow orb behind hero text */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute left-1/2 top-1/3 -z-10 h-[500px] w-[500px] -translate-x-1/2 rounded-full opacity-20"
              style={{
                background: "radial-gradient(circle, rgba(234,179,8,0.18) 0%, transparent 70%)",
              }}
            />

            <div className="mx-auto max-w-4xl">
              <div className="animate-fade-in-up">
                {/* GoblinAI badge pill above title */}
                <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-bg-green/30 bg-bg-green/10 px-4 py-1.5 text-sm font-medium text-bg-green backdrop-blur-sm">
                  <Sparkles className="h-4 w-4" />
                  Novità: assistente IA per le regole
                </div>
              </div>

              <h1
                className="animate-fade-in-up stagger-1 mb-6 text-4xl font-extrabold leading-tight tracking-tight sm:text-6xl lg:text-7xl"
                style={{ textShadow: "0 4px 32px rgba(0,0,0,0.8)" }}
              >
                Il tavolo da gioco{" "}
                <span className="bg-gradient-to-r from-bg-yellow via-yellow-300 to-bg-yellow bg-clip-text text-transparent">
                  definitivo
                </span>{" "}
                per Magic
              </h1>

              <p
                className="animate-fade-in-up stagger-2 mx-auto mb-10 max-w-2xl text-base leading-relaxed text-font-primary/80 sm:text-lg lg:text-xl"
                style={{ textShadow: "0 2px 16px rgba(0,0,0,0.7)" }}
              >
                Costruisci mazzi, testali in goldfish, sfida amici in partite 1v1
                sincronizzate. E quando hai un dubbio sulle regole, chiedi a GoblinAI
                — l&apos;assistente IA che conosce il regolamento ufficiale, le
                interazioni tra carte e i ruling dei giudici. Tutto dal browser. Gratis.
              </p>

              <div className="animate-fade-in-up stagger-3 flex flex-wrap justify-center gap-4">
                <Link
                  href="/login"
                  className="group inline-flex items-center gap-2 rounded-xl bg-bg-accent px-7 py-3 text-base font-semibold text-font-white shadow-lg shadow-bg-accent/25 transition-all hover:bg-bg-accent-dark hover:shadow-xl hover:shadow-bg-accent/30 active:scale-[0.98]"
                >
                  Inizia ora
                  <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-0.5" />
                </Link>
                <Link
                  href="/about"
                  className="inline-flex items-center gap-2 rounded-xl border border-font-white/12 bg-bg-dark/50 px-7 py-3 text-base font-medium text-font-primary backdrop-blur-sm transition-all hover:border-font-white/20 hover:bg-bg-cell/70"
                >
                  Scopri di più
                </Link>
              </div>
            </div>
          </section>

          {/* ── Feature Cards ── */}
          <div className="mx-auto max-w-6xl px-4 pb-12 sm:pb-20">
            <section className="relative mb-16 sm:mb-24">
              <div className="mb-10 text-center">
                <h2 className="animate-fade-in-up mb-3 text-2xl font-bold tracking-tight sm:text-3xl">
                  Tutto ciò che ti serve per giocare
                </h2>
                <p className="animate-fade-in-up stagger-1 mx-auto max-w-xl text-sm text-font-secondary sm:text-base">
                  Un ecosistema completo dal deckbuilding al tavolo da gioco,
                  con strumenti pensati per giocatori veri.
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div className="feature-card animate-fade-in-up stagger-1 group relative overflow-hidden rounded-2xl bg-bg-surface p-6 sm:p-7">
                  <div className="ornament-left" />
                  <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-bg-accent/10 text-bg-accent ring-1 ring-bg-accent/15">
                    <Layers className="h-5 w-5" />
                  </div>
                  <h3 className="mb-2 text-base font-bold">Deck Builder</h3>
                  <p className="text-sm leading-relaxed text-font-secondary">
                    Main, sideboard, maybeboard, token. Importa da Moxfield,
                    Archidekt, MTGO. Sezioni, tag, foil tracking, statistiche.
                  </p>
                </div>

                <div className="feature-card animate-fade-in-up stagger-2 group relative overflow-hidden rounded-2xl bg-bg-surface p-6 sm:p-7">
                  <div className="ornament-left" />
                  <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-bg-green/10 text-bg-green ring-1 ring-bg-green/15">
                    <Fish className="h-5 w-5" />
                  </div>
                  <h3 className="mb-2 text-base font-bold">Goldfish</h3>
                  <p className="text-sm leading-relaxed text-font-secondary">
                    Testa il mazzo contro Ghost, il bot. London Mulligan, fasi,
                    turni, zone di gioco. Simula la pescata reale.
                  </p>
                </div>

                <div className="feature-card animate-fade-in-up stagger-3 group relative overflow-hidden rounded-2xl bg-bg-surface p-6 sm:p-7">
                  <div className="ornament-left" />
                  <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-bg-yellow/10 text-bg-yellow ring-1 ring-bg-yellow/15">
                    <Swords className="h-5 w-5" />
                  </div>
                  <h3 className="mb-2 text-base font-bold">Multiplayer 1v1</h3>
                  <p className="text-sm leading-relaxed text-font-secondary">
                    Lobby con codice, partite sincronizzate in tempo reale,
                    chat integrata, gestione token e counter condivisi.
                  </p>
                </div>

                <div className="feature-card animate-fade-in-up stagger-4 group relative overflow-hidden rounded-2xl bg-bg-surface p-6 sm:p-7">
                  <div className="ornament-left" />
                  <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-bg-orange/10 text-bg-orange ring-1 ring-bg-orange/15">
                    <Users className="h-5 w-5" />
                  </div>
                  <h3 className="mb-2 text-base font-bold">Community</h3>
                  <p className="text-sm leading-relaxed text-font-secondary">
                    Profili pubblici, mazzi condivisibili, ricerca giocatori,
                    cronologia partite. Collezione personale tracciabile.
                  </p>
                </div>
              </div>

              {/* Second row — extra features */}
              <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <div className="feature-card animate-fade-in-up stagger-4 group relative overflow-hidden rounded-2xl bg-bg-surface p-6 sm:p-7">
                  <div className="ornament-left" />
                  <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-bg-red/10 text-bg-red ring-1 ring-bg-red/15">
                    <Zap className="h-5 w-5" />
                  </div>
                  <h3 className="mb-2 text-base font-bold">Proxy PDF</h3>
                  <p className="text-sm leading-relaxed text-font-secondary">
                    Stampa il mazzo come fogli proxy pronti per il playtest.
                    Bleed modes, crop marks, preset raster ottimizzato.
                  </p>
                </div>

                <div className="feature-card animate-fade-in-up stagger-5 group relative overflow-hidden rounded-2xl bg-bg-surface p-6 sm:p-7">
                  <div className="ornament-left" />
                  <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-font-accent/10 text-font-accent ring-1 ring-font-accent/15">
                    <ShieldCheck className="h-5 w-5" />
                  </div>
                  <h3 className="mb-2 text-base font-bold">Life Counter</h3>
                  <p className="text-sm leading-relaxed text-font-secondary">
                    Contatore vite standalone con storico, tracciamento
                    commander damage e condivisione stato partita.
                  </p>
                </div>

                <div className="feature-card animate-fade-in-up stagger-6 group relative overflow-hidden rounded-2xl bg-bg-surface p-6 sm:p-7">
                  <div className="ornament-left" />
                  <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-bg-cell text-font-muted ring-1 ring-border">
                    <BookOpen className="h-5 w-5" />
                  </div>
                  <h3 className="mb-2 text-base font-bold">Collezione</h3>
                  <p className="text-sm leading-relaxed text-font-secondary">
                    Traccia le carte che possiedi con quantità, foil, lingua e
                    condizioni. Filtri avanzati e statistiche.
                  </p>
                </div>
              </div>
            </section>

            {/* ── GoblinAI Spotlight ── */}
            <section className="relative mb-16 sm:mb-24">
              <div
                aria-hidden="true"
                className="pointer-events-none absolute -inset-4 rounded-3xl opacity-30"
                style={{
                  background: "radial-gradient(ellipse 70% 50% at 50% 50%, rgba(34,197,94,0.12) 0%, transparent 70%)",
                }}
              />

              <div className="goblin-card animate-goblin-glow relative overflow-hidden rounded-3xl bg-bg-surface p-6 sm:p-10 lg:p-14">
                <div className="goblin-ornament-left" />
                <div className="goblin-ornament-right" />
                <div className="goblin-radial pointer-events-none absolute inset-0" />

                <div className="relative z-10 flex flex-col items-center text-center lg:flex-row lg:items-start lg:gap-12 lg:text-left">
                  {/* Goblin mascot + badge column */}
                  <div className="mb-6 shrink-0 lg:mb-0">
                    <div className="mx-auto flex h-28 w-28 items-center justify-center rounded-2xl border border-bg-green/20 bg-bg-green/5 sm:h-36 sm:w-36">
                      {/* Goblin face SVG */}
                      <svg viewBox="0 0 120 120" className="h-20 w-20 sm:h-28 sm:w-28" aria-hidden="true">
                        <ellipse cx="60" cy="62" rx="44" ry="38" fill="#166534" />
                        <ellipse cx="60" cy="68" rx="32" ry="24" fill="#1a3a1a" />
                        {/* Eyes */}
                        <ellipse cx="42" cy="52" rx="11" ry="13" fill="#fde047" />
                        <ellipse cx="78" cy="52" rx="11" ry="13" fill="#fde047" />
                        <ellipse cx="42" cy="53" rx="5" ry="5" fill="#1a1a1a" />
                        <ellipse cx="78" cy="53" rx="5" ry="5" fill="#1a1a1a" />
                        {/* Pupil glint */}
                        <circle cx="44" cy="50" r="2" fill="#fff" />
                        <circle cx="80" cy="50" r="2" fill="#fff" />
                        {/* Mouth — toothy grin */}
                        <path d="M35 76 Q60 96 85 76" fill="#4a1a1a" stroke="#2a2a2a" strokeWidth="1.5" />
                        <path d="M42 76 L44 84 L48 76 L52 85 L56 76 L60 86 L64 76 L68 85 L72 76 L76 84 L78 76" fill="#f0f0dd" />
                        {/* Ears */}
                        <ellipse cx="14" cy="55" rx="14" ry="22" fill="#166534" transform="rotate(-15 14 55)" />
                        <ellipse cx="106" cy="55" rx="14" ry="22" fill="#166534" transform="rotate(15 106 55)" />
                        <ellipse cx="14" cy="55" rx="8" ry="14" fill="#1a5630" transform="rotate(-15 14 55)" />
                        <ellipse cx="106" cy="55" rx="8" ry="14" fill="#1a5630" transform="rotate(15 106 55)" />
                        {/* Nose */}
                        <ellipse cx="60" cy="64" rx="6" ry="4" fill="#0d3318" />
                      </svg>
                    </div>
                    <div className="mt-3 text-center">
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-bg-green/25 bg-bg-green/10 px-3 py-1 text-xs font-semibold text-bg-green">
                        <Sparkles className="h-3 w-3" />
                        DeepSeek V4
                      </span>
                    </div>
                  </div>

                  {/* Content */}
                  <div className="flex-1">
                    <h2 className="mb-3 text-2xl font-extrabold tracking-tight sm:text-4xl">
                      <span className="bg-gradient-to-r from-bg-green via-green-400 to-bg-green bg-clip-text text-transparent">
                        GoblinAI
                      </span>{" "}
                      — il giudice nel tuo browser
                    </h2>
                    <p className="mb-6 text-sm leading-relaxed text-font-secondary sm:text-base">
                      Un assistente IA specializzato nelle regole di Magic: The
                      Gathering. Menziona le carte con @ e GoblinAI analizza il
                      testo oracolare, recupera le regole ufficiali dal
                      comprehensive rulebook e ti spiega esattamente come
                      interagiscono — con tanto di numeri di regola e ruling
                      dei giudici.
                    </p>

                    {/* Capability pills */}
                    <div className="mb-8 flex flex-wrap gap-2">
                      {[
                        { icon: Search, label: "Ricerca carte via @" },
                        { icon: MessageCircle, label: "Domande in italiano" },
                        { icon: BookOpen, label: "Regole ufficiali citate" },
                        { icon: ShieldCheck, label: "Ruling dei giudici" },
                        { icon: Zap, label: "Conferma interattiva" },
                      ].map(({ icon: Icon, label }) => (
                        <span
                          key={label}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-bg-card px-3 py-1.5 text-xs font-medium text-font-primary"
                        >
                          <Icon className="h-3 w-3 text-bg-green" />
                          {label}
                        </span>
                      ))}
                    </div>

                    {/* Example query */}
                    <div className="rounded-xl border border-bg-green/15 bg-bg-dark/50 p-4 text-left font-mono text-xs text-font-secondary sm:text-sm">
                      <span className="text-bg-green">@Protean Hulk</span>{" "}
                      <span className="text-font-muted">muore, posso andare a prendere</span>{" "}
                      <span className="text-bg-green">@Viscera Seer</span>{" "}
                      <span className="text-font-muted">e</span>{" "}
                      <span className="text-bg-green">@Body Double</span>
                      <span className="text-font-muted">?</span>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* ── How it works ── */}
            <section className="relative mb-16 sm:mb-24">
              <div className="animate-fade-in-up mx-auto max-w-3xl rounded-2xl border border-border bg-bg-surface p-6 sm:p-10">
                <div className="ornament-left" />
                <h2 className="mb-6 text-center text-xl font-bold tracking-tight sm:text-3xl">
                  Come funziona
                </h2>
                <div className="grid gap-4 sm:grid-cols-4">
                  {[
                    { step: "1", title: "Accedi", desc: "Login con Google in un click. Nessuna carta di credito." },
                    { step: "2", title: "Crea un mazzo", desc: "Importa una decklist o costruisci da zero nel Deck Builder." },
                    { step: "3", title: "Testa", desc: "Prova il mazzo in Goldfish o stampa i proxy per il playtest." },
                    { step: "4", title: "Gioca", desc: "Crea una lobby, invita un amico e giocate 1v1 sincronizzati." },
                  ].map(({ step, title, desc }) => (
                    <div key={step} className="text-center">
                      <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-bg-accent/10 text-sm font-bold text-bg-accent ring-1 ring-bg-accent/20">
                        {step}
                      </div>
                      <h3 className="mb-1 text-sm font-semibold">{title}</h3>
                      <p className="text-xs leading-relaxed text-font-secondary">{desc}</p>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            {/* ── CTA ── */}
            <section className="animate-fade-in-up hero-card animate-glow-pulse relative overflow-hidden rounded-3xl bg-bg-surface p-8 text-center sm:p-14">
              <div className="ornament-left" />
              <div className="ornament-right" />
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 opacity-10"
                style={{
                  background: "radial-gradient(ellipse 60% 50% at 50% 40%, rgba(234,179,8,0.25) 0%, transparent 70%)",
                }}
              />
              <div className="relative z-10">
                <h2 className="mb-3 text-2xl font-extrabold tracking-tight sm:text-4xl">
                  Pronto a giocare?
                </h2>
                <p className="mb-8 text-sm text-font-secondary sm:text-base">
                  Accesso gratuito. Nessuna installazione. Solo Magic.
                </p>
                <Link
                  href="/login"
                  className="group inline-flex items-center gap-2 rounded-xl bg-bg-accent px-8 py-3.5 text-base font-bold text-font-white shadow-lg shadow-bg-accent/30 transition-all hover:bg-bg-accent-dark hover:shadow-xl hover:shadow-bg-accent/40 active:scale-[0.98]"
                >
                  Accedi con Google
                  <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-0.5" />
                </Link>
              </div>
            </section>
          </div>
        </main>

        {/* ── Footer ── */}
        <footer className="border-t border-border/40">
          <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-4 py-6 text-xs text-font-muted sm:flex-row">
            <span>© {new Date().getFullYear()} Adunata</span>
            <nav className="flex items-center gap-5">
              <Link href="/privacy" className="transition-colors hover:text-font-accent hover:underline">
                Privacy Policy
              </Link>
              <Link href="/terms" className="transition-colors hover:text-font-accent hover:underline">
                Termini di servizio
              </Link>
              <a href="mailto:gidippi@gmail.com" className="transition-colors hover:text-font-accent hover:underline">
                Contatti
              </a>
            </nav>
          </div>
        </footer>
      </div>
    </>
  );
}
