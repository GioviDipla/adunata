export default function CardsLoading() {
  return (
    <div className="min-h-screen bg-bg-dark">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 animate-pulse">
        <div className="mb-6 h-9 w-48 rounded bg-bg-cell" />
        <div className="mb-4 h-10 rounded-lg bg-bg-cell/60" />
        <div className="mb-4 flex gap-2">
          <div className="h-8 w-20 rounded-full bg-bg-cell/60" />
          <div className="h-8 w-20 rounded-full bg-bg-cell/60" />
          <div className="h-8 w-20 rounded-full bg-bg-cell/60" />
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5">
          {Array.from({ length: 20 }).map((_, i) => (
            <div key={i} className="aspect-[5/7] rounded-lg bg-bg-cell/60" />
          ))}
        </div>
      </div>
    </div>
  )
}
