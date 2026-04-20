export default function GoldfishLoading() {
  return (
    <div className="fixed inset-0 z-40 flex flex-col items-center justify-center bg-bg-dark">
      <div className="flex items-center gap-3 text-font-muted">
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-bg-accent border-t-transparent" />
        <span className="text-sm">Shuffling deck...</span>
      </div>
    </div>
  )
}
