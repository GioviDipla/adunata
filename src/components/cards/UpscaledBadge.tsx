interface UpscaledBadgeProps {
  className?: string
}

export default function UpscaledBadge({ className = '' }: UpscaledBadgeProps) {
  return (
    <span
      className={`inline-flex h-4 min-w-5 items-center justify-center rounded bg-bg-accent/90 px-1 text-[9px] font-black leading-none text-font-white shadow-sm ring-1 ring-black/30 ${className}`}
      title="Upscaled 2x image available"
      aria-label="Upscaled 2x image available"
    >
      2x
    </span>
  )
}
