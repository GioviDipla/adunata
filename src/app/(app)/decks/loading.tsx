export default function DecksLoading() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-8 animate-pulse">
      <div className="mb-8 flex items-center justify-between">
        <div className="h-9 w-40 rounded bg-bg-cell" />
        <div className="flex gap-3">
          <div className="h-9 w-28 rounded-lg bg-bg-cell/70" />
          <div className="h-9 w-28 rounded-lg bg-bg-accent/40" />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="overflow-hidden rounded-xl border border-border bg-bg-surface">
            <div className="aspect-[5/3] w-full bg-bg-cell/60" />
            <div className="space-y-2 p-4">
              <div className="h-4 w-3/4 rounded bg-bg-cell/60" />
              <div className="h-3 w-1/2 rounded bg-bg-cell/40" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
