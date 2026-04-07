interface HandCardProps {
  type: string;
  typeColor: string;
  name: string;
  cost: string;
  costColor: string;
}

export function HandCard({
  type,
  typeColor,
  name,
  cost,
  costColor,
}: HandCardProps) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-[3px] rounded-md border border-border-light bg-bg-surface h-[72px] p-1">
      <span className={`font-inter text-[7px] font-medium ${typeColor}`}>
        {type}
      </span>
      <span className="font-inter text-[9px] font-semibold text-font-primary text-center whitespace-pre-line leading-tight">
        {name}
      </span>
      <span className={`font-inter text-[8px] font-bold ${costColor}`}>
        {cost}
      </span>
    </div>
  );
}
