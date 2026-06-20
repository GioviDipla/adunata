export default function DashboardLoading() {
  return (
    <div className="flex flex-col gap-8 animate-pulse">
      {/* Welcome */}
      <div>
        <div className="h-8 w-56 rounded bg-bg-cell" />
        <div className="mt-2 h-4 w-40 rounded bg-bg-cell/60" />
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="rounded-xl border border-border bg-bg-card p-4"
          >
            <div className="flex items-center gap-2.5">
              <div className="h-9 w-9 shrink-0 rounded-lg bg-bg-cell" />
              <div className="min-w-0 space-y-1.5">
                <div className="h-5 w-10 rounded bg-bg-cell" />
                <div className="h-3 w-16 rounded bg-bg-cell/60" />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Quick Actions */}
      <div>
        <div className="mb-4 h-6 w-32 rounded bg-bg-cell" />
        <div className="grid gap-3 sm:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="rounded-xl border border-border bg-bg-card p-4"
            >
              <div className="flex items-center gap-4">
                <div className="h-10 w-10 shrink-0 rounded-lg bg-bg-cell" />
                <div className="min-w-0 space-y-1.5">
                  <div className="h-4 w-24 rounded bg-bg-cell" />
                  <div className="h-3 w-32 rounded bg-bg-cell/60" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Recent Decks + Recent Games */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Recent Decks */}
        <div>
          <div className="mb-4 h-6 w-28 rounded bg-bg-cell" />
          <div className="flex flex-col gap-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="rounded-xl border border-border bg-bg-card px-5 py-3.5"
              >
                <div className="space-y-1.5">
                  <div className="h-4 w-40 rounded bg-bg-cell" />
                  <div className="h-3 w-32 rounded bg-bg-cell/60" />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Recent Games */}
        <div>
          <div className="mb-4 h-6 w-28 rounded bg-bg-cell" />
          <div className="flex flex-col gap-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="rounded-xl border border-border bg-bg-card px-5 py-3.5"
              >
                <div className="space-y-1.5">
                  <div className="h-4 w-36 rounded bg-bg-cell" />
                  <div className="h-3 w-40 rounded bg-bg-cell/60" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
