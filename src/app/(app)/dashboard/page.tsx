import { createClient } from "@/lib/supabase/server";
import {
  Search,
  Plus,
  Upload,
  Layers,
  Library,
  ArrowRight,
} from "lucide-react";
import Link from "next/link";

export default async function DashboardPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Fetch deck count
  const { count: deckCount } = await supabase
    .from("decks")
    .select("*", { count: "exact", head: true })
    .eq("user_id", user!.id);

  // Fetch total cards across all decks
  const { data: deckIds } = await supabase
    .from("decks")
    .select("id")
    .eq("user_id", user!.id);

  let totalCards = 0;
  if (deckIds && deckIds.length > 0) {
    const { data: cardCounts } = await supabase
      .from("deck_cards")
      .select("quantity")
      .in(
        "deck_id",
        deckIds.map((d) => d.id)
      );

    if (cardCounts) {
      totalCards = cardCounts.reduce((sum, c) => sum + c.quantity, 0);
    }
  }

  // Fetch recent decks
  const { data: recentDecks } = await supabase
    .from("decks")
    .select("id, name, format, updated_at")
    .eq("user_id", user!.id)
    .order("updated_at", { ascending: false })
    .limit(5);

  const quickActions = [
    {
      label: "Browse Cards",
      href: "/cards",
      icon: Search,
      description: "Search the entire card database",
    },
    {
      label: "Create Deck",
      href: "/decks/new",
      icon: Plus,
      description: "Build a new deck from scratch",
    },
    {
      label: "Import Deck",
      href: "/decks/import",
      icon: Upload,
      description: "Import a deck from a list",
    },
  ];

  return (
    <div className="flex flex-col gap-8">
      {/* Welcome */}
      <div>
        <h1 className="text-2xl font-bold text-font-primary">
          Welcome back
        </h1>
        <p className="mt-1 text-sm text-font-secondary">{user!.email}</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-border bg-bg-card p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-bg-accent/10">
              <Layers className="h-5 w-5 text-font-accent" />
            </div>
            <div>
              <p className="text-2xl font-bold text-font-primary">
                {deckCount ?? 0}
              </p>
              <p className="text-xs text-font-secondary">Decks</p>
            </div>
          </div>
        </div>
        <div className="rounded-xl border border-border bg-bg-card p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-bg-accent/10">
              <Library className="h-5 w-5 text-font-accent" />
            </div>
            <div>
              <p className="text-2xl font-bold text-font-primary">
                {totalCards}
              </p>
              <p className="text-xs text-font-secondary">Total cards</p>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div>
        <h2 className="mb-4 text-lg font-semibold text-font-primary">
          Quick actions
        </h2>
        <div className="grid gap-3 sm:grid-cols-3">
          {quickActions.map((action) => {
            const Icon = action.icon;
            return (
              <Link
                key={action.href}
                href={action.href}
                className="group flex items-center gap-4 rounded-xl border border-border bg-bg-card p-4 transition-colors hover:border-border-light hover:bg-bg-hover"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-bg-accent/10 transition-colors group-hover:bg-bg-accent/20">
                  <Icon className="h-5 w-5 text-font-accent" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-font-primary">
                    {action.label}
                  </p>
                  <p className="text-xs text-font-muted">
                    {action.description}
                  </p>
                </div>
              </Link>
            );
          })}
        </div>
      </div>

      {/* Recent Decks */}
      <div>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-font-primary">
            Recent decks
          </h2>
          {(recentDecks?.length ?? 0) > 0 && (
            <Link
              href="/decks"
              className="flex items-center gap-1 text-sm text-font-accent hover:underline"
            >
              View all <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          )}
        </div>

        {!recentDecks || recentDecks.length === 0 ? (
          <div className="rounded-xl border border-border bg-bg-card p-8 text-center">
            <Layers className="mx-auto h-10 w-10 text-font-muted" />
            <p className="mt-3 text-sm text-font-secondary">
              No decks yet. Create your first deck to get started.
            </p>
            <Link
              href="/decks/new"
              className="mt-4 inline-flex items-center gap-2 rounded-lg bg-bg-accent px-4 py-2 text-sm font-medium text-font-white transition-colors hover:bg-bg-accent-dark"
            >
              <Plus className="h-4 w-4" />
              Create deck
            </Link>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {recentDecks.map((deck) => (
              <Link
                key={deck.id}
                href={`/decks/${deck.id}`}
                className="flex items-center justify-between rounded-xl border border-border bg-bg-card px-5 py-4 transition-colors hover:border-border-light hover:bg-bg-hover"
              >
                <div>
                  <p className="text-sm font-medium text-font-primary">
                    {deck.name}
                  </p>
                  <p className="text-xs text-font-muted">
                    {deck.format}
                    {" \u00b7 "}
                    Updated{" "}
                    {new Date(deck.updated_at).toLocaleDateString()}
                  </p>
                </div>
                <ArrowRight className="h-4 w-4 text-font-muted" />
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
