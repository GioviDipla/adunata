export default function GoldfishLoading() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-bg-dark">
      <div className="flex items-center gap-3 text-font-muted">
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-bg-accent border-t-transparent" />
        <span className="text-sm">Shuffling deck...</span>
      </div>
    </div>
  )
}
