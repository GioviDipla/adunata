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
              Adunata
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

        {/* Collapse toggle */}
        <div className="mt-auto border-t border-border px-3 py-2">
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

      {/* Mobile bottom tab bar */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 flex items-stretch border-t border-border bg-bg-surface md:hidden safe-area-bottom">
        {navItems.map((item, idx) => {
          const Icon = item.icon;
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-1 flex-col items-center justify-center gap-0.5 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] text-[11px] font-medium transition-colors ${
                idx > 0 ? "border-l border-border/40" : ""
              } ${
                active
                  ? "text-font-accent bg-bg-accent/5"
                  : "text-font-muted active:bg-bg-hover"
              }`}
            >
              <Icon className="h-5 w-5" />
              <span className="truncate max-w-[4rem]">{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}
