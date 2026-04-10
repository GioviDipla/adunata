export default function PlayLoading() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-6 animate-pulse">
      <div className="mb-6 h-8 w-24 rounded bg-bg-cell" />
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="h-48 rounded-xl border border-border bg-bg-card" />
        <div className="h-48 rounded-xl border border-border bg-bg-card" />
      </div>
    </div>
  )
}
