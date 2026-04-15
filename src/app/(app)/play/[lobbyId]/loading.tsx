export default function LobbyLoading() {
  return (
    <div className="flex flex-col gap-6 animate-pulse">
      <div className="h-8 w-40 rounded bg-bg-cell" />
      <div className="rounded-xl border border-border bg-bg-card p-6 space-y-4">
        <div className="h-6 w-48 rounded bg-bg-cell" />
        <div className="h-4 w-32 rounded bg-bg-cell/60" />
        <div className="flex gap-4 mt-4">
          <div className="h-24 flex-1 rounded-xl bg-bg-cell/60" />
          <div className="h-24 flex-1 rounded-xl bg-bg-cell/60" />
        </div>
        <div className="h-10 w-32 rounded bg-bg-cell mt-4" />
      </div>
    </div>
  )
}
