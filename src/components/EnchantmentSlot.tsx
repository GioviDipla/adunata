interface EnchantmentSlotProps {
  name: string;
}

export function EnchantmentSlot({ name }: EnchantmentSlotProps) {
  return (
    <div className="flex flex-1 items-center justify-center rounded border border-border bg-bg-cell h-8">
      <span className="font-inter text-[8px] font-medium text-font-secondary">
        {name}
      </span>
    </div>
  );
}

export function EmptyEnchantmentSlot() {
  return (
    <div className="flex flex-1 items-center justify-center rounded border border-dashed border-border bg-bg-card h-8">
      <svg
        className="text-font-muted"
        width="12"
        height="12"
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
