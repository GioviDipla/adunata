export default function DashboardLoading() {
  return (
    <div className="flex flex-col gap-10 animate-pulse">
      {/* Welcome */}
      <div>
        <div className="h-8 w-56 rounded bg-bg-cell" />
        <div className="mt-2 h-4 w-40 rounded bg-bg-cell/60" />
      </div>

      {/* Card Browser placeholder */}
      <div>
        <div className="rounded-xl border border-border bg-bg-card p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="h-10 flex-1 rounded-lg bg-bg-cell" />
            <div className="h-10 w-24 rounded-lg bg-bg-cell/60" />
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {Array.from({ length: 10 }).map((_, i) => (
              <div
                key={i}
                className="aspect-[488/680] rounded-lg bg-bg-cell"
              />
            ))}
          </div>
        </div>
      </div>

      {/* Active Games */}
      <div>
        <div className="mb-4 h-6 w-28 rounded bg-bg-cell" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="rounded-xl border border-border bg-bg-card p-4"
            >
              <div className="flex items-center gap-2">
                <div className="h-5 w-14 rounded-full bg-bg-cell" />
                <div className="h-3 w-16 rounded bg-bg-cell/60" />
              </div>
              <div className="mt-2 h-4 w-full rounded bg-bg-cell" />
              <div className="mt-2 flex gap-3">
                <div className="h-3 w-16 rounded bg-bg-cell/60" />
                <div className="h-3 w-12 rounded bg-bg-cell/60" />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* My Decks + Public Decks */}
      <div className="grid gap-6 lg:grid-cols-2">
        {[0, 1].map((col) => (
          <div key={col}>
            <div className="mb-4 h-6 w-32 rounded bg-bg-cell" />
            <div className="flex flex-col gap-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div
                  key={i}
                  className="flex gap-4 rounded-xl border border-border bg-bg-card p-4"
                >
                  <div className="h-16 w-24 shrink-0 rounded-lg bg-bg-cell" />
                  <div className="min-w-0 space-y-1.5">
                    <div className="h-4 w-32 rounded bg-bg-cell" />
                    <div className="h-3 w-24 rounded bg-bg-cell/60" />
                    <div className="h-2.5 w-20 rounded bg-bg-cell/60" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Liked Cards */}
      <div>
        <div className="mb-4 h-6 w-24 rounded bg-bg-cell" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="overflow-hidden rounded-xl border border-border bg-bg-card"
            >
              <div className="aspect-[488/680] w-full bg-bg-cell" />
              <div className="p-2">
                <div className="h-3 w-20 rounded bg-bg-cell/60" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
