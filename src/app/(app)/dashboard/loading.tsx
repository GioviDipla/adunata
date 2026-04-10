export default function DashboardLoading() {
  return (
    <div className="flex flex-col gap-8 animate-pulse">
      {/* Welcome */}
      <div>
        <div className="h-8 w-56 rounded bg-bg-cell" />
        <div className="mt-2 h-4 w-40 rounded bg-bg-cell/60" />
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4">
        <div className="h-20 rounded-xl border border-border bg-bg-card" />
        <div className="h-20 rounded-xl border border-border bg-bg-card" />
      </div>

      {/* Quick actions */}
      <div>
        <div className="mb-4 h-6 w-32 rounded bg-bg-cell" />
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="h-20 rounded-xl border border-border bg-bg-card" />
          <div className="h-20 rounded-xl border border-border bg-bg-card" />
          <div className="h-20 rounded-xl border border-border bg-bg-card" />
        </div>
      </div>

      {/* Recent decks */}
      <div>
        <div className="mb-4 h-6 w-32 rounded bg-bg-cell" />
        <div className="flex flex-col gap-2">
          <div className="h-16 rounded-xl border border-border bg-bg-card" />
          <div className="h-16 rounded-xl border border-border bg-bg-card" />
          <div className="h-16 rounded-xl border border-border bg-bg-card" />
        </div>
      </div>
    </div>
  )
}
