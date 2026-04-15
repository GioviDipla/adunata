export default function NewDeckLoading() {
  return (
    <div className="flex flex-col gap-6 animate-pulse">
      <div className="h-8 w-48 rounded bg-bg-cell" />
      <div className="rounded-xl border border-border bg-bg-card p-6 space-y-4">
        <div className="h-5 w-24 rounded bg-bg-cell" />
        <div className="h-10 w-full rounded bg-bg-cell/60" />
        <div className="h-5 w-24 rounded bg-bg-cell" />
        <div className="h-10 w-full rounded bg-bg-cell/60" />
        <div className="h-5 w-24 rounded bg-bg-cell" />
        <div className="h-24 w-full rounded bg-bg-cell/60" />
        <div className="h-10 w-32 rounded bg-bg-cell" />
      </div>
    </div>
  )
}
