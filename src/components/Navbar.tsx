"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
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
  Menu,
  X,
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
  const [mobileOpen, setMobileOpen] = useState(false);

  // Close mobile drawer on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

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
      {/* Desktop sidebar — transparent, same visual treatment as the mobile dock */}
      <aside className={`hidden md:flex ${collapsed ? 'md:w-16' : 'md:w-60'} md:flex-col md:fixed md:inset-y-0 transition-all duration-200`}>
        {/* Logo */}
        <div className={`flex h-16 items-center gap-2 ${collapsed ? 'justify-center px-2' : 'px-6'}`}>
          <Sparkles className="h-6 w-6 shrink-0 text-font-accent" />
          {!collapsed && (
            <span className="text-lg font-bold text-font-primary">
              Adunata!!!
            </span>
          )}
        </div>

        {/* Nav links — round icon pill + label (when expanded), same look as mobile dock */}
        <nav className="flex flex-1 flex-col gap-1 px-3 py-4">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`group flex items-center ${collapsed ? 'justify-center' : 'gap-3'} text-sm font-medium transition-colors ${
                  active ? "text-font-primary" : "text-font-secondary hover:text-font-primary"
                }`}
                title={item.label}
              >
                <span
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full backdrop-blur-md ring-1 transition-colors ${
                    active
                      ? "bg-bg-accent/80 text-font-white ring-font-white/30"
                      : "bg-bg-dark/60 text-font-primary ring-white/10 group-hover:bg-white/10"
                  }`}
                >
                  <Icon className="h-5 w-5" />
                </span>
                {!collapsed && item.label}
              </Link>
            );
          })}
        </nav>

        {/* About / info link */}
        <div className="mt-auto px-3 py-2">
          <Link
            href="/about"
            className={`group flex w-full items-center ${collapsed ? 'justify-center' : 'gap-3'} text-sm font-medium transition-colors ${
              isActive('/about') ? 'text-font-primary' : 'text-font-secondary hover:text-font-primary'
            }`}
            title="Info su Adunata"
          >
            <span
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full backdrop-blur-md ring-1 transition-colors ${
                isActive('/about')
                  ? 'bg-bg-accent/80 text-font-white ring-font-white/30'
                  : 'bg-bg-dark/60 text-font-primary ring-white/10 group-hover:bg-white/10'
              }`}
            >
              <Info className="h-5 w-5" />
            </span>
            {!collapsed && 'Leggi qui!'}
          </Link>
        </div>

        {/* Collapse toggle */}
        <div className="px-3 py-2">
          <button
            onClick={toggle}
            className={`group flex w-full items-center ${collapsed ? 'justify-center' : 'gap-3'} text-sm font-medium text-font-secondary transition-colors hover:text-font-primary`}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-bg-dark/60 text-font-primary ring-1 ring-white/10 backdrop-blur-md transition-colors group-hover:bg-white/10">
              {collapsed ? <PanelLeftOpen className="h-5 w-5" /> : <PanelLeftClose className="h-5 w-5" />}
            </span>
            {!collapsed && "Collapse"}
          </button>
        </div>

        {/* Logout */}
        <div className="px-3 py-4">
          <button
            onClick={handleLogout}
            className={`group flex w-full items-center ${collapsed ? 'justify-center' : 'gap-3'} text-sm font-medium text-font-secondary transition-colors hover:text-font-primary`}
            title="Sign out"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-bg-dark/60 text-font-primary ring-1 ring-white/10 backdrop-blur-md transition-colors group-hover:bg-white/10">
              <LogOut className="h-5 w-5" />
            </span>
            {!collapsed && "Sign out"}
          </button>
        </div>
      </aside>

      {/* Mobile floating hamburger — rounded-square FAB on the left edge */}
      <button
        type="button"
        aria-label={mobileOpen ? "Close menu" : "Open menu"}
        onClick={() => setMobileOpen((v) => !v)}
        className="mobile-navbar fixed left-4 z-50 flex h-12 w-12 items-center justify-center rounded-2xl bg-bg-dark/70 text-font-primary ring-1 ring-white/10 backdrop-blur-md transition-colors active:bg-white/10 md:hidden"
      >
        {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </button>

      {/* Mobile drawer — slides in from the left when hamburger is tapped.
          Transparent backdrop (click-capture only) + transparent panel,
          so the icons and labels float over page content just like on desktop. */}
      <div
        className={`fixed inset-0 z-40 md:hidden ${mobileOpen ? "pointer-events-auto" : "pointer-events-none"}`}
        aria-hidden={!mobileOpen}
      >
        <div
          className="absolute inset-0"
          onClick={() => setMobileOpen(false)}
        />
        <aside
          className={`absolute left-0 top-0 flex h-full w-72 flex-col transition-transform duration-200 ${
            mobileOpen ? "translate-x-0" : "-translate-x-full"
          }`}
          style={{
            paddingTop: "env(safe-area-inset-top)",
            // Leave room under Sign out so the close-FAB (hamburger → X) sits below both bottom rows.
            paddingBottom: "calc(env(safe-area-inset-bottom) + 5.5rem)",
          }}
        >
          <div className="flex h-16 items-center gap-2 px-6">
            <Sparkles className="h-6 w-6 shrink-0 text-font-accent" />
            <span className="text-lg font-bold text-font-primary">Adunata!!!</span>
          </div>

          <nav className="flex flex-1 flex-col gap-2 px-3 py-4">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = isActive(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`group flex items-center gap-3 text-base font-medium transition-colors ${
                    active ? "text-font-primary" : "text-font-secondary hover:text-font-primary"
                  }`}
                >
                  <span
                    className={`flex h-16 w-16 shrink-0 items-center justify-center rounded-full ring-1 backdrop-blur-xl transition-colors ${
                      active
                        ? "bg-bg-accent/85 text-font-white ring-font-white/40"
                        : "bg-white/25 text-font-primary ring-white/40 group-hover:bg-white/35"
                    }`}
                  >
                    <Icon className="h-8 w-8" />
                  </span>
                  <span
                    className={`rounded-full px-4 py-2 text-base ring-1 backdrop-blur-xl transition-colors ${
                      active
                        ? "bg-bg-accent/85 text-font-white ring-font-white/40"
                        : "bg-white/25 text-font-primary ring-white/40 group-hover:bg-white/35"
                    }`}
                  >
                    {item.label}
                  </span>
                </Link>
              );
            })}
          </nav>

          <div className="mt-auto px-3 py-2">
            <Link
              href="/about"
              className={`group flex w-full items-center gap-3 text-base font-medium transition-colors ${
                isActive("/about") ? "text-font-primary" : "text-font-secondary hover:text-font-primary"
              }`}
            >
              <span
                className={`flex h-16 w-16 shrink-0 items-center justify-center rounded-full ring-1 backdrop-blur-xl transition-colors ${
                  isActive("/about")
                    ? "bg-bg-accent/85 text-font-white ring-font-white/40"
                    : "bg-white/25 text-font-primary ring-white/40 group-hover:bg-white/35"
                }`}
              >
                <Info className="h-8 w-8" />
              </span>
              <span
                className={`rounded-full px-4 py-2 text-base ring-1 backdrop-blur-xl transition-colors ${
                  isActive("/about")
                    ? "bg-bg-accent/85 text-font-white ring-font-white/40"
                    : "bg-white/25 text-font-primary ring-white/40 group-hover:bg-white/35"
                }`}
              >
                Leggi qui!
              </span>
            </Link>
          </div>

          <div className="px-3 py-4">
            <button
              onClick={handleLogout}
              className="group flex w-full items-center gap-3 text-base font-medium text-font-secondary transition-colors hover:text-font-primary"
            >
              <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-white/25 text-font-primary ring-1 ring-white/40 backdrop-blur-xl transition-colors group-hover:bg-white/35">
                <LogOut className="h-8 w-8" />
              </span>
              <span className="rounded-full bg-white/25 text-font-primary ring-1 ring-white/40 backdrop-blur-xl px-4 py-2 text-base transition-colors group-hover:bg-white/35">
                Sign out
              </span>
            </button>
          </div>
        </aside>
      </div>
    </>
  );
}
