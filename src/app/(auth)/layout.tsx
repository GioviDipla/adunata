export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div
      className="relative isolate flex min-h-screen items-center justify-center overflow-hidden bg-bg-dark px-4 py-12"
      style={{ paddingTop: 'max(3rem, env(safe-area-inset-top))' }}
    >
      {/* Background hero — same brand artwork as the marketing home, top-anchored
          so the logotype reads behind the auth card instead of being clipped. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-20 bg-[length:140%_auto] bg-[position:center_-2rem] bg-no-repeat opacity-70 saturate-110 sm:bg-[length:90%_auto] sm:bg-[position:center_top]"
        style={{ backgroundImage: "url('/icons/logo-full.png')" }}
      />
      {/* Fading gradient — keeps the card legible while preserving the hero
          texture at the very top edge of the viewport. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            'linear-gradient(180deg, rgba(18,18,24,0.05) 0%, rgba(18,18,24,0.28) 22%, rgba(18,18,24,0.62) 48%, rgba(18,18,24,0.86) 72%, #121218 100%)',
        }}
      />
      <div
        className="w-full max-w-md rounded-2xl border border-font-white/10 bg-bg-surface/85 p-8 shadow-2xl backdrop-blur-md"
        style={{ boxShadow: '0 30px 60px -20px rgba(0,0,0,0.7)' }}
      >
        {children}
      </div>
    </div>
  );
}
