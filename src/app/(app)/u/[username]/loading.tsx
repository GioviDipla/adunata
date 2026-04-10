export default function PublicProfileLoading() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-6 animate-pulse">
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="h-20 w-20 rounded-full bg-bg-cell" />
        <div className="flex-1 space-y-2">
          <div className="h-6 w-48 rounded bg-bg-cell" />
          <div className="h-4 w-32 rounded bg-bg-cell/70" />
          <div className="h-4 w-64 rounded bg-bg-cell/60" />
        </div>
      </div>

      <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-24 rounded-xl border border-border bg-bg-surface" />
        ))}
      </div>

      <div className="mb-3 h-5 w-40 rounded bg-bg-cell/60" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-20 rounded-xl border border-border bg-bg-surface" />
        ))}
      </div>
    </div>
  )
}
