type ManaColor = "white" | "blue" | "black" | "red" | "green";

const manaColorMap: Record<ManaColor, string> = {
  white: "bg-mana-white",
  blue: "bg-mana-blue",
  black: "bg-mana-black",
  red: "bg-mana-red",
  green: "bg-mana-green",
};

interface LandSlotProps {
  color: ManaColor;
}

export function LandSlot({ color }: LandSlotProps) {
  return (
    <div className="flex flex-1 items-center justify-center rounded border border-border bg-bg-cell h-9">
      <div className={`h-2 w-2 rounded-full ${manaColorMap[color]}`} />
    </div>
  );
}
