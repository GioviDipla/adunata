"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Search,
  Layers,
  Swords,
  User,
  Users,
  LogOut,
  Sparkles,
  PanelLeftClose,
  PanelLeftOpen,
  Info,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useSidebar } from "@/lib/contexts/SidebarContext";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/cards", label: "Cards", icon: Search },
  { href: "/decks", label: "Decks", icon: Layers },
  { href: "/play", label: "Play", icon: Swords },
  { href: "/users", label: "Community", icon: Users },
  { href: "/profile", label: "Profile", icon: User },
];

export function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const { collapsed, toggle } = useSidebar();

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  function isActive(href: string) {
    return pathname === href || pathname.startsWith(href + "/");
  }

  return (
    <>
      {/* Desktop sidebar */}
      <aside className={`hidden md:flex ${collapsed ? 'md:w-16' : 'md:w-60'} md:flex-col md:fixed md:inset-y-0 border-r border-border bg-bg-surface transition-all duration-200`}>
        {/* Logo */}
        <div className={`flex h-16 items-center gap-2 border-b border-border ${collapsed ? 'justify-center px-2' : 'px-6'}`}>
          <Sparkles className="h-6 w-6 shrink-0 text-font-accent" />
          {!collapsed && (
            <span className="text-lg font-bold text-font-primary">
              Adunata!!!
            </span>
          )}
        </div>

        {/* Nav links */}
        <nav className="flex flex-1 flex-col gap-1 px-3 py-4">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center ${collapsed ? 'justify-center' : 'gap-3'} rounded-lg ${collapsed ? 'px-0 py-2.5' : 'px-3 py-2.5'} text-sm font-medium transition-colors ${
                  active
                    ? "bg-bg-accent/10 text-font-accent"
                    : "text-font-secondary hover:bg-bg-hover hover:text-font-primary"
                }`}
                title={item.label}
              >
                <Icon className="h-5 w-5 shrink-0" />
                {!collapsed && item.label}
              </Link>
            );
          })}
        </nav>

        {/* About / info link */}
        <div className="mt-auto border-t border-border px-3 py-2">
          <Link
            href="/about"
            className={`flex w-full items-center ${collapsed ? 'justify-center' : 'gap-3'} rounded-lg ${collapsed ? 'px-0 py-2.5' : 'px-3 py-2.5'} text-sm font-medium transition-colors ${
              isActive('/about')
                ? 'bg-bg-accent/10 text-font-accent'
                : 'text-font-secondary hover:bg-bg-hover hover:text-font-primary'
            }`}
            title="Info su Adunata"
          >
            <Info className="h-5 w-5 shrink-0" />
            {!collapsed && 'Leggi qui!'}
          </Link>
        </div>

        {/* Collapse toggle */}
        <div className="border-t border-border px-3 py-2">
          <button
            onClick={toggle}
            className={`flex w-full items-center ${collapsed ? 'justify-center' : 'gap-3'} rounded-lg ${collapsed ? 'px-0 py-2.5' : 'px-3 py-2.5'} text-sm font-medium text-font-secondary transition-colors hover:bg-bg-hover hover:text-font-primary`}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? <PanelLeftOpen className="h-5 w-5" /> : <PanelLeftClose className="h-5 w-5" />}
            {!collapsed && "Collapse"}
          </button>
        </div>

        {/* Logout */}
        <div className="border-t border-border px-3 py-4">
          <button
            onClick={handleLogout}
            className={`flex w-full items-center ${collapsed ? 'justify-center' : 'gap-3'} rounded-lg ${collapsed ? 'px-0 py-2.5' : 'px-3 py-2.5'} text-sm font-medium text-font-secondary transition-colors hover:bg-bg-hover hover:text-font-primary`}
            title="Sign out"
          >
            <LogOut className="h-5 w-5 shrink-0" />
            {!collapsed && "Sign out"}
          </button>
        </div>
      </aside>

      {/* Mobile floating icon dock — transparent container, each icon is a
          self-contained pill. Parabolic vertical offset per index gives a
          horizon arc (outer icons sit lower than center). */}
      <nav className="mobile-navbar fixed left-0 right-0 z-50 flex justify-around items-center pointer-events-none md:hidden">
        {navItems.map((item, idx) => {
          const Icon = item.icon;
          const active = isActive(item.href);
          const center = (navItems.length - 1) / 2;
          const half = center;
          const normalized = Math.abs(idx - center) / half;
          const arcPx = normalized * normalized * 12;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-label={item.label}
              style={{ transform: `translateY(${arcPx}px)` }}
              className={`pointer-events-auto flex h-11 w-11 items-center justify-center rounded-full backdrop-blur-md transition-colors ${
                active
                  ? "bg-bg-accent/80 text-font-white ring-1 ring-font-white/30"
                  : "bg-bg-dark/60 text-font-primary ring-1 ring-white/10"
              }`}
            >
              <Icon className="h-5 w-5" />
            </Link>
          );
        })}
      </nav>
    </>
  );
}
