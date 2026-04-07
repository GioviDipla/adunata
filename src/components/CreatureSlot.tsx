interface CreatureSlotProps {
  name: string;
  stats: string;
  highlighted?: boolean;
}

export function CreatureSlot({ name, stats, highlighted }: CreatureSlotProps) {
  return (
    <div
      className={`flex flex-1 flex-col items-center justify-center gap-0.5 rounded border bg-bg-cell h-14 ${
        highlighted ? "border-bg-green" : "border-border"
      }`}
    >
      <span className="font-inter text-[8px] font-medium text-font-secondary">
        {name}
      </span>
      <span className="font-inter text-[11px] font-bold text-font-primary">
        {stats}
      </span>
    </div>
  );
}

export function EmptySlot() {
  return (
    <div className="flex flex-1 items-center justify-center rounded border border-dashed border-border bg-bg-card h-14">
      <svg
        className="text-font-muted"
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <line x1="12" y1="5" x2="12" y2="19" />
        <line x1="5" y1="12" x2="19" y2="12" />
      </svg>
    </div>
  );
}
