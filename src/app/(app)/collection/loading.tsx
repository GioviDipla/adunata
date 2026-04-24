// Matches the skeleton rhythm used by `/decks/loading.tsx` so the shell
// doesn't flash during the RSC fetch.
export default function CollectionLoading() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-6 animate-pulse">
      <div className="mb-4 flex items-center justify-between">
        <div className="h-7 w-56 rounded bg-bg-cell" />
        <div className="h-9 w-28 rounded-lg bg-bg-accent/40" />
      </div>
      <div className="mb-4 h-10 w-full rounded-lg bg-bg-cell/60" />
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
        {Array.from({ length: 12 }).map((_, i) => (
          <div key={i} className="overflow-hidden rounded-lg border border-border bg-bg-surface">
            <div className="aspect-[5/7] w-full bg-bg-cell/60" />
            <div className="space-y-1.5 p-2">
              <div className="h-3 w-3/4 rounded bg-bg-cell/60" />
              <div className="h-2.5 w-1/2 rounded bg-bg-cell/40" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
