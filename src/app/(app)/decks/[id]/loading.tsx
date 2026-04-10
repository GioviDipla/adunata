export default function DeckDetailLoading() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-4 sm:py-6 animate-pulse">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3">
          <div className="h-8 w-64 rounded bg-bg-cell" />
          <div className="h-5 w-16 rounded-full bg-bg-cell/60" />
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <div className="h-8 w-24 rounded-lg bg-bg-accent/30" />
          <div className="h-8 w-20 rounded-lg bg-bg-cell/60" />
          <div className="h-8 w-20 rounded-lg bg-bg-cell/60" />
        </div>
      </div>

      {/* Two-panel layout */}
      <div className="flex flex-col gap-6 lg:flex-row">
        {/* Left: card list */}
        <div className="flex-1 space-y-3">
          <div className="h-10 rounded-lg bg-bg-cell/60" />
          <div className="h-9 rounded-lg bg-bg-cell/40" />
          <div className="flex flex-col gap-2 pt-2">
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="h-12 rounded-lg border border-border bg-bg-surface" />
            ))}
          </div>
        </div>
        {/* Right: stats */}
        <div className="w-full shrink-0 lg:w-80">
          <div className="h-64 rounded-xl border border-border bg-bg-surface" />
        </div>
      </div>
    </div>
  )
}
