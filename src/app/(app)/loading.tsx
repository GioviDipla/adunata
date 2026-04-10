export default function Loading() {
  return (
    <div className="flex flex-col gap-4 animate-pulse">
      <div className="h-6 w-48 rounded bg-bg-cell" />
      <div className="h-4 w-32 rounded bg-bg-cell/70" />
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="h-24 rounded-xl bg-bg-cell/60" />
        <div className="h-24 rounded-xl bg-bg-cell/60" />
      </div>
      <div className="mt-4 flex flex-col gap-2">
        <div className="h-14 rounded-xl bg-bg-cell/50" />
        <div className="h-14 rounded-xl bg-bg-cell/50" />
        <div className="h-14 rounded-xl bg-bg-cell/50" />
      </div>
    </div>
  )
}
