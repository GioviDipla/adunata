export default function ImportDeckLoading() {
  return (
    <div className="flex flex-col gap-6 animate-pulse">
      <div className="h-8 w-44 rounded bg-bg-cell" />
      <div className="rounded-xl border border-border bg-bg-card p-6 space-y-4">
        <div className="h-5 w-32 rounded bg-bg-cell" />
        <div className="h-40 w-full rounded bg-bg-cell/60" />
        <div className="h-10 w-32 rounded bg-bg-cell" />
      </div>
    </div>
  )
}
