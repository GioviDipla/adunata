import { type ReactNode } from "react";

interface StatBadgeProps {
  icon: ReactNode;
  value: string;
}

export function StatBadge({ icon, value }: StatBadgeProps) {
  return (
    <div className="flex items-center gap-1 rounded-lg bg-bg-cell px-2 py-1">
      {icon}
      <span className="font-inter text-sm font-bold text-font-primary">
        {value}
      </span>
    </div>
  );
}
