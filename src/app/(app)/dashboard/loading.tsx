export default function DashboardLoading() {
  return (
    <div className="flex flex-col gap-10 animate-pulse">
      {/* Welcome */}
      <div>
        <div className="h-8 w-56 rounded bg-bg-cell" />
        <div className="mt-2 h-4 w-40 rounded bg-bg-cell/60" />
      </div>

      {/* Active Games */}
      <div>
        <div className="mb-4 h-6 w-28 rounded bg-bg-cell" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
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

      {/* Latest Decks */}
      <div>
        <div className="mb-4 h-6 w-28 rounded bg-bg-cell" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="overflow-hidden rounded-xl border border-border bg-bg-card"
            >
              <div className="aspect-[5/3] w-full bg-bg-cell" />
              <div className="flex flex-col gap-1.5 p-3.5">
                <div className="h-4 w-32 rounded bg-bg-cell" />
                <div className="flex justify-between">
                  <div className="h-3 w-12 rounded bg-bg-cell/60" />
                  <div className="h-3 w-20 rounded bg-bg-cell/60" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Latest Cards */}
      <div>
        <div className="mb-4 h-6 w-24 rounded bg-bg-cell" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {Array.from({ length: 10 }).map((_, i) => (
            <div
              key={i}
              className="overflow-hidden rounded-xl border border-border bg-bg-card"
            >
              <div className="aspect-[488/680] w-full bg-bg-cell" />
              <div className="flex flex-col gap-1 p-2.5">
                <div className="h-3 w-20 rounded bg-bg-cell" />
                <div className="h-2.5 w-16 rounded bg-bg-cell/60" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
