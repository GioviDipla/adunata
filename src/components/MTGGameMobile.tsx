import {
  Heart,
  Droplets,
  Layers,
  User,
  Signal,
  Wifi,
  BatteryFull,
  Menu,
  Archive,
  SkipForward,
  MessageCircle,
  Settings,
  Timer,
} from "lucide-react";

import { StatBadge } from "./StatBadge";
import { LandSlot } from "./LandSlot";
import { CreatureSlot, EmptySlot } from "./CreatureSlot";
import { EnchantmentSlot, EmptyEnchantmentSlot } from "./EnchantmentSlot";
import { HandCard } from "./HandCard";

function SectionLabel({ children }: { children: string }) {
  return (
    <span className="font-inter text-[9px] font-semibold tracking-wider text-font-muted">
      {children}
    </span>
  );
}

export function MTGGameMobile() {
  return (
    <div className="flex flex-col w-[393px] h-[852px] bg-bg-dark font-inter">
      {/* ── Status Bar ── */}
      <div className="flex items-center justify-between px-6 h-[62px] bg-bg-dark">
        <span className="text-[15px] font-semibold text-font-primary">
          9:41
        </span>
        <div className="flex items-center gap-1.5">
          <Signal size={16} className="text-font-primary" />
          <Wifi size={16} className="text-font-primary" />
          <BatteryFull size={16} className="text-font-primary" />
        </div>
      </div>

      {/* ── Opponent Bar ── */}
      <div className="flex items-center justify-between px-4 h-14 bg-bg-surface border-b border-border">
        <div className="flex items-center gap-2.5">
          <div className="flex items-center justify-center w-9 h-9 rounded-full bg-bg-cell">
            <User size={18} className="text-font-secondary" />
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-sm font-semibold text-font-primary">
              DarkMage42
            </span>
            <span className="text-[11px] font-medium text-bg-accent">
              Their Turn
            </span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <StatBadge
            icon={<Heart size={14} className="text-bg-red" />}
            value="17"
          />
          <StatBadge
            icon={<Droplets size={14} className="text-mana-blue" />}
            value="4/7"
          />
          <StatBadge
            icon={<Layers size={14} className="text-font-secondary" />}
            value="5"
          />
        </div>
      </div>

      {/* ── Opponent Battlefield ── */}
      <div className="flex flex-1 flex-col gap-1.5 p-2 bg-bg-dark">
        <SectionLabel>LANDS</SectionLabel>
        <div className="flex gap-1">
          <LandSlot color="white" />
          <LandSlot color="blue" />
          <LandSlot color="blue" />
          <LandSlot color="black" />
          <LandSlot color="black" />
          <LandSlot color="red" />
          <LandSlot color="white" />
        </div>

        <SectionLabel>CREATURES</SectionLabel>
        <div className="flex gap-1">
          <CreatureSlot name="Goblin" stats="2/2" />
          <CreatureSlot name="Knight" stats="3/3" />
          <CreatureSlot name="Dragon" stats="5/5" />
          <EmptySlot />
        </div>

        <SectionLabel>ENCHANTMENTS</SectionLabel>
        <div className="flex gap-1">
          <EnchantmentSlot name="Pacifism" />
          <EmptyEnchantmentSlot />
        </div>
      </div>

      {/* ── Phase Bar ── */}
      <div className="flex items-center justify-between px-2 h-8 bg-bg-surface border-y border-border">
        <span className="font-inter text-[10px] font-bold tracking-wider text-bg-accent">
          MAIN PHASE 1
        </span>
        <div className="flex items-center gap-[3px]">
          {[false, false, true, false, false, false].map((active, i) => (
            <div
              key={i}
              className={`w-4 h-1 rounded-sm ${active ? "bg-bg-accent" : "bg-font-muted"}`}
            />
          ))}
        </div>
        <div className="flex items-center gap-1">
          <Timer size={12} className="text-font-secondary" />
          <span className="font-inter text-[11px] font-semibold text-font-secondary">
            12:34
          </span>
        </div>
      </div>

      {/* ── Player Battlefield ── */}
      <div className="flex flex-1 flex-col gap-1.5 p-2 bg-bg-dark">
        <SectionLabel>ENCHANTMENTS</SectionLabel>
        <div className="flex gap-1">
          <EnchantmentSlot name="Honor" />
          <EnchantmentSlot name="Aegis" />
          <EmptyEnchantmentSlot />
        </div>

        <SectionLabel>CREATURES</SectionLabel>
        <div className="flex gap-1">
          <CreatureSlot name="Angel" stats="4/4" highlighted />
          <CreatureSlot name="Soldier" stats="2/2" highlighted />
          <CreatureSlot name="Elf" stats="1/1" />
          <EmptySlot />
        </div>

        <SectionLabel>LANDS</SectionLabel>
        <div className="flex gap-1">
          <LandSlot color="white" />
          <LandSlot color="white" />
          <LandSlot color="green" />
          <LandSlot color="green" />
          <LandSlot color="green" />
          <LandSlot color="white" />
          <LandSlot color="blue" />
          <LandSlot color="blue" />
        </div>
      </div>

      {/* ── Player Bar ── */}
      <div className="flex items-center justify-between px-3 h-12 bg-bg-surface border-t border-border">
        <div className="flex items-center gap-2">
          <div className="flex items-center justify-center w-8 h-8 rounded-full bg-bg-accent">
            <User size={16} className="text-font-white" />
          </div>
          <div className="flex flex-col gap-px">
            <span className="text-[13px] font-semibold text-font-primary">
              You
            </span>
            <span className="text-[10px] font-medium text-bg-green">
              Your Turn
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <StatBadge
            icon={<Heart size={14} className="text-bg-red" />}
            value="20"
          />
          <StatBadge
            icon={<Droplets size={14} className="text-mana-blue" />}
            value="6/8"
          />
          <StatBadge
            icon={<Layers size={14} className="text-font-secondary" />}
            value="42"
          />
        </div>
      </div>

      {/* ── Player Hand ── */}
      <div className="flex flex-col gap-1 px-2 py-1.5 bg-bg-card border-t border-border">
        <SectionLabel>YOUR HAND (4)</SectionLabel>
        <div className="flex gap-1.5">
          <HandCard
            type="Instant"
            typeColor="text-font-accent"
            name={"Counter\nSpell"}
            cost="UU"
            costColor="text-mana-blue"
          />
          <HandCard
            type="Creature"
            typeColor="text-bg-green"
            name={"Serra\nAngel"}
            cost="3WW"
            costColor="text-mana-white"
          />
          <HandCard
            type="Sorcery"
            typeColor="text-bg-red"
            name={"Lightning\nBolt"}
            cost="R"
            costColor="text-mana-red"
          />
          <HandCard
            type="Land"
            typeColor="text-font-secondary"
            name="Plains"
            cost=""
            costColor="text-font-muted"
          />
        </div>
      </div>

      {/* ── Action Bar ── */}
      <div className="flex items-center justify-between gap-2 px-3 pt-2 pb-6 bg-bg-surface border-t border-border">
        <ActionButton icon={<Menu size={20} />} label="MENU" />
        <ActionButton icon={<Archive size={20} />} label="GRAVE" />
        <div className="flex flex-1 flex-col items-center justify-center gap-1 h-11 rounded-xl bg-bg-accent">
          <SkipForward size={20} className="text-font-white" />
          <span className="font-inter text-[8px] font-bold tracking-wider text-font-white">
            PASS
          </span>
        </div>
        <ActionButton icon={<MessageCircle size={20} />} label="CHAT" />
        <ActionButton icon={<Settings size={20} />} label="MORE" />
      </div>
    </div>
  );
}

function ActionButton({
  icon,
  label,
}: {
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-1">
      <div className="text-font-secondary">{icon}</div>
      <span className="font-inter text-[8px] font-semibold tracking-wider text-font-muted">
        {label}
      </span>
    </div>
  );
}
