import { createClient } from "@/lib/supabase/server";
import { getAuthenticatedUser } from "@/lib/supabase/get-user";
import { redirect } from "next/navigation";
import {
  Search,
  Plus,
  Upload,
  Layers,
  Swords,
  ArrowRight,
  Library,
  Play,
  MessageCircle,
  Trophy,
} from "lucide-react";
import Link from "next/link";

const STATUS_LABELS: Record<string, string> = {
  waiting: "Waiting",
  playing: "In progress",
  finished: "Finished",
};

function formatRelativeDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString();
}

interface GameLobby {
  id: string;
  status: string | null;
  format: string | null;
  name: string | null;
  created_at: string;
  winner_id: string | null;
}

export default async function DashboardPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");

  const supabase = await createClient();

  const [
    { data: profile },
    { count: deckCount },
    { data: recentDecks },
    { count: cardCount },
    { count: gameCount },
    { data: recentGamePlayers },
    { data: deckFormats },
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select("username, display_name")
      .eq("id", user.id)
      .single(),
    supabase
      .from("decks")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id),
    supabase
      .from("decks")
      .select("id, name, format, updated_at, card_count")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false })
      .limit(5),
    supabase
      .from("user_cards")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id),
    supabase
      .from("game_players")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id),
    supabase
      .from("game_players")
      .select("id, lobby_id, joined_at")
      .eq("user_id", user.id)
      .order("joined_at", { ascending: false })
      .limit(5),
    supabase
      .from("decks")
      .select("format")
      .eq("user_id", user.id),
  ]);

  // Fetch lobby data for recent game players
  const lobbyIds = [...new Set(recentGamePlayers?.map((gp) => gp.lobby_id) ?? [])];
  const { data: lobbyRows } =
    lobbyIds.length > 0
      ? await supabase
          .from("game_lobbies")
          .select("id, status, format, name, created_at, winner_id")
          .in("id", lobbyIds)
      : { data: [] };
  const lobbyMap = new Map<string, GameLobby>(
    (lobbyRows ?? []).map((l) => [l.id, l as GameLobby]),
  );

  const recentGames = (recentGamePlayers ?? []).map((gp) => ({
    ...gp,
    lobby: lobbyMap.get(gp.lobby_id) ?? null,
  }));

  const formatCounts: Record<string, number> = {};
  deckFormats?.forEach((d) => {
    const fmt = d.format || "Unknown";
    formatCounts[fmt] = (formatCounts[fmt] || 0) + 1;
  });
  const favoriteFormat =
    Object.entries(formatCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

  const displayName =
    profile?.display_name || profile?.username || user.email;
  const firstName =
    displayName !== user.email ? displayName!.split(" ")[0] : null;

  const quickActions = [
    {
      label: "Browse Cards",
      href: "/cards",
      icon: Search,
      description: "Search the card database",
    },
    {
      label: "Create Deck",
      href: "/decks/new",
      icon: Plus,
      description: "Build a new deck",
    },
    {
      label: "Import Deck",
      href: "/decks/import",
      icon: Upload,
      description: "Import from a list",
    },
    {
      label: "Play Game",
      href: "/play",
      icon: Play,
      description: "Join or create a lobby",
    },
    {
      label: "Goldfish",
      href: "/decks",
      icon: Swords,
      description: "Solo-playtest a deck",
    },
    {
      label: "Ask GoblinAI",
      href: "/goblinai",
      icon: MessageCircle,
      description: "AI rules assistant",
    },
  ];

  const stats = [
    { label: "Decks", value: deckCount ?? 0, icon: Layers },
    { label: "Cards owned", value: cardCount ?? 0, icon: Library },
    { label: "Games played", value: gameCount ?? 0, icon: Play },
    {
      label: "Top format",
      value: favoriteFormat ?? "—",
      icon: Trophy,
      isText: !favoriteFormat,
    },
  ];

  const hasDecks = (recentDecks?.length ?? 0) > 0;
  const hasGames = (recentGames?.length ?? 0) > 0;

  return (
    <div className="flex flex-col gap-8">
      {/* Welcome */}
      <div>
        <h1 className="text-2xl font-bold text-font-primary">
          Welcome back{firstName ? `, ${firstName}` : ""}
        </h1>
        <p className="mt-1 text-sm text-font-secondary">{user.email}</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <div
              key={stat.label}
              className="rounded-xl border border-border bg-bg-card p-4"
            >
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-bg-accent/10">
                  <Icon className="h-[18px] w-[18px] text-font-accent" />
                </div>
                <div className="min-w-0">
                  <p
                    className={
                      stat.isText
                        ? "text-sm font-semibold leading-tight text-font-primary"
                        : "text-lg font-bold leading-tight text-font-primary"
                    }
                  >
                    {stat.value}
                  </p>
                  <p className="text-xs text-font-muted truncate">
                    {stat.label}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
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

      {/* Recent Decks + Recent Games */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Recent Decks */}
        <div>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-font-primary">
              Recent decks
            </h2>
            {hasDecks && (
              <Link
                href="/decks"
                className="flex items-center gap-1 text-sm text-font-accent hover:underline"
              >
                View all <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            )}
          </div>

          {!hasDecks ? (
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
              {recentDecks!.map((deck) => (
                <Link
                  key={deck.id}
                  href={`/decks/${deck.id}`}
                  className="flex items-center justify-between rounded-xl border border-border bg-bg-card px-5 py-3.5 transition-colors hover:border-border-light hover:bg-bg-hover"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-font-primary">
                      {deck.name}
                    </p>
                    <p className="text-xs text-font-muted">
                      {deck.format}
                      {deck.card_count != null && (
                        <>{" \u00b7 "}{deck.card_count} cards</>
                      )}
                      {" \u00b7 "}
                      {formatRelativeDate(deck.updated_at)}
                    </p>
                  </div>
                  <ArrowRight className="ml-3 h-4 w-4 shrink-0 text-font-muted" />
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Recent Games */}
        <div>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-font-primary">
              Recent games
            </h2>
            {hasGames && (
              <Link
                href="/play"
                className="flex items-center gap-1 text-sm text-font-accent hover:underline"
              >
                View all <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            )}
          </div>

          {!hasGames ? (
            <div className="rounded-xl border border-border bg-bg-card p-8 text-center">
              <Play className="mx-auto h-10 w-10 text-font-muted" />
              <p className="mt-3 text-sm text-font-secondary">
                No games yet. Join a lobby or create your own.
              </p>
              <Link
                href="/play"
                className="mt-4 inline-flex items-center gap-2 rounded-lg bg-bg-accent px-4 py-2 text-sm font-medium text-font-white transition-colors hover:bg-bg-accent-dark"
              >
                <Swords className="h-4 w-4" />
                Start playing
              </Link>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {recentGames.map((gp) => {
                const lobby = gp.lobby;
                const isWinner =
                  lobby?.winner_id != null &&
                  lobby.winner_id === user.id;
                const status = lobby?.status ?? null;
                const statusColor =
                  status === "playing"
                    ? "text-bg-green"
                    : status === "waiting"
                      ? "text-bg-yellow"
                      : "text-font-muted";

                return (
                  <Link
                    key={gp.id}
                    href={lobby ? `/play/${lobby.id}` : "#"}
                    className="flex items-center justify-between rounded-xl border border-border bg-bg-card px-5 py-3.5 transition-colors hover:border-border-light hover:bg-bg-hover"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-sm font-medium text-font-primary">
                          {lobby?.name || "Game"}
                        </p>
                        {isWinner && (
                          <span className="shrink-0 rounded-full bg-bg-accent/15 px-2 py-0.5 text-[11px] font-semibold text-font-accent">
                            Won
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-font-muted">
                        {lobby?.format || "Unknown format"}
                        {" \u00b7 "}
                        <span className={statusColor}>
                          {status
                            ? STATUS_LABELS[status] || status
                            : "Unknown"}
                        </span>
                        {" \u00b7 "}
                        {lobby?.created_at
                          ? formatRelativeDate(lobby.created_at)
                          : formatRelativeDate(gp.joined_at)}
                      </p>
                    </div>
                    <ArrowRight className="ml-3 h-4 w-4 shrink-0 text-font-muted" />
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
