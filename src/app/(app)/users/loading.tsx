export default function UsersLoading() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-6 animate-pulse">
      <div className="mb-6 h-8 w-40 rounded bg-bg-cell" />
      <div className="mb-4 h-11 rounded-lg bg-bg-cell/60" />
      <div className="mb-3 h-4 w-32 rounded bg-bg-cell/60" />
      <div className="grid gap-3 sm:grid-cols-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-24 rounded-xl border border-border bg-bg-surface" />
        ))}
      </div>
    </div>
  )
}
