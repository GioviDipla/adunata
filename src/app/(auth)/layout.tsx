export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div
      className="relative isolate min-h-screen overflow-hidden bg-bg-dark"
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
    >
      {/* Background hero — identical sizing/position to the marketing home
          (`src/app/page.tsx` lines 35-41) so the brand artwork reads the
          same on /login as on /. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-20 bg-[length:100%_auto] bg-top bg-no-repeat opacity-80 saturate-110 sm:bg-cover sm:opacity-80"
        style={{ backgroundImage: "url('/icons/logo-full.png')" }}
      />
      {/* Same fading gradient as home — gentle at the very top so the
          banner reads, then darkens through the middle so the card floats
          on a dark wash. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            'linear-gradient(180deg, rgba(18,18,24,0.02) 0%, rgba(18,18,24,0.14) 18%, rgba(18,18,24,0.46) 44%, rgba(18,18,24,0.78) 68%, #121218 100%)',
        }}
      />

      {/* Layout: tall hero spacer on top (mirrors home's pt-52/pt-64),
          card centered below, footer hint at the bottom. */}
      <main className="flex min-h-screen flex-col items-center px-4 pb-10 pt-40 sm:pt-56 lg:pt-64">
        <div
          className="w-full max-w-md rounded-2xl border border-font-white/10 bg-bg-surface/85 p-8 backdrop-blur-md"
          style={{ boxShadow: '0 30px 60px -20px rgba(0,0,0,0.7)' }}
        >
          {children}
        </div>
      </main>
    </div>
  );
}
