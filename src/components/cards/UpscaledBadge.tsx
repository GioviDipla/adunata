import { ImageIcon } from 'lucide-react'

interface UpscaledBadgeProps {
  className?: string
}

export default function UpscaledBadge({ className = '' }: UpscaledBadgeProps) {
  return (
    <span
      className={`inline-flex h-4 w-4 items-center justify-center rounded bg-bg-accent/90 text-font-white shadow-sm ring-1 ring-black/30 ${className}`}
      title="Upscaled image available"
      aria-label="Upscaled image available"
    >
      <ImageIcon className="h-2.5 w-2.5" aria-hidden="true" strokeWidth={2.75} />
    </span>
  )
}
