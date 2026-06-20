import { createClient } from "@/lib/supabase/server";
import { getAuthenticatedUser } from "@/lib/supabase/get-user";
import { redirect } from "next/navigation";
import { Swords, ArrowRight, Clock, Users } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

const STATUS_LABELS: Record<string, string> = {
  waiting: "Waiting",
  playing: "In progress",
};

function timeAgo(dateStr: string): string {
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

export default async function DashboardPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");

  const supabase = await createClient();

  // ── Batch 1: independent queries ──
  const [
    { data: profile },
    { data: activeGames },
    { data: latestDecks },
    { data: latestCards },
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select("username, display_name")
      .eq("id", user.id)
      .single(),
    supabase
      .from("game_lobbies")
      .select("id, name, format, status, host_user_id, created_at")
      .in("status", ["waiting", "playing"])
      .order("created_at", { ascending: false })
      .limit(8),
    supabase
      .from("decks")
      .select("id, name, format, updated_at, card_count, user_id, cover_card_id")
      .in("visibility", ["public", "unlisted"])
      .order("updated_at", { ascending: false })
      .limit(12),
    supabase
      .from("cards")
      .select("id, name, image_small, image_normal, type_line, mana_cost")
      .order("created_at", { ascending: false })
      .limit(10),
  ]);

  // ── Batch 2: resolve deck cover images + owner profiles ──
  const coverIds = [
    ...new Set(
      latestDecks
        ?.map((d) => d.cover_card_id)
        .filter((id): id is number => id != null) ?? [],
    ),
  ];

  const deckOwnerIds = [
    ...new Set(latestDecks?.map((d) => d.user_id) ?? []),
  ];

  const gameHostIds = [
    ...new Set(
      activeGames?.map((g) => g.host_user_id).filter(Boolean) ?? [],
    ),
  ];

  const allUserIds = [...new Set([...deckOwnerIds, ...gameHostIds])];

  const [{ data: coverCards }, { data: allProfiles }] = await Promise.all([
    coverIds.length > 0
      ? supabase
          .from("cards")
          .select("id, name, image_art_crop, image_normal")
          .in("id", coverIds)
      : { data: [] },
    allUserIds.length > 0
      ? supabase
          .from("profiles")
          .select("id, username, display_name")
          .in("id", allUserIds)
      : { data: [] },
  ]);

  const coverMap = new Map(
    (coverCards ?? []).map((c) => [c.id, c]),
  );
  const profileMap = new Map(
    (allProfiles ?? []).map((p) => [p.id, p]),
  );

  const displayName =
    profile?.display_name || profile?.username || user.email;
  const firstName =
    displayName !== user.email ? displayName!.split(" ")[0] : null;

  const hasGames = (activeGames?.length ?? 0) > 0;
  const hasDecks = (latestDecks?.length ?? 0) > 0;

  return (
    <div className="flex flex-col gap-10">
      {/* Welcome */}
      <div>
        <h1 className="text-2xl font-bold text-font-primary">
          Welcome back{firstName ? `, ${firstName}` : ""}
        </h1>
        <p className="mt-1 text-sm text-font-secondary">{user.email}</p>
      </div>

      {/* Active Games */}
      {hasGames && (
        <section>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-font-primary">
              Active games
            </h2>
            <Link
              href="/play"
              className="flex items-center gap-1 text-sm text-font-accent hover:underline"
            >
              View all <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {activeGames!.map((game) => {
              const host = profileMap.get(game.host_user_id);
              const hostName =
                host?.display_name || host?.username || "Unknown";
              return (
                <Link
                  key={game.id}
                  href={`/play/${game.id}`}
                  className="group flex flex-col gap-3 rounded-xl border border-border bg-bg-card p-4 transition-colors hover:border-border-light hover:bg-bg-hover"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={
                        game.status === "playing"
                          ? "shrink-0 rounded-full bg-bg-green/20 px-2 py-0.5 text-[11px] font-semibold text-bg-green"
                          : "shrink-0 rounded-full bg-bg-yellow/20 px-2 py-0.5 text-[11px] font-semibold text-bg-yellow"
                      }
                    >
                      {STATUS_LABELS[game.status] || game.status}
                    </span>
                    <span className="text-xs text-font-muted">
                      {game.format}
                    </span>
                  </div>
                  <p className="text-sm font-medium text-font-primary line-clamp-2">
                    {game.name || "Unnamed lobby"}
                  </p>
                  <div className="mt-auto flex items-center gap-3 text-xs text-font-muted">
                    <span className="flex items-center gap-1">
                      <Users className="h-3 w-3" />
                      {hostName}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {timeAgo(game.created_at)}
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {/* Latest Decks */}
      <section>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-font-primary">
            Latest decks
          </h2>
        </div>

        {!hasDecks ? (
          <div className="rounded-xl border border-border bg-bg-card p-8 text-center">
            <Swords className="mx-auto h-10 w-10 text-font-muted" />
            <p className="mt-3 text-sm text-font-secondary">
              No public decks yet.
            </p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {latestDecks!.map((deck) => {
              const coverCard = deck.cover_card_id
                ? coverMap.get(deck.cover_card_id)
                : null;
              const coverSrc =
                coverCard?.image_art_crop ?? coverCard?.image_normal ?? null;
              const owner = profileMap.get(deck.user_id);
              const ownerName =
                owner?.display_name || owner?.username || "Unknown";

              return (
                <Link
                  key={deck.id}
                  href={`/decks/${deck.id}`}
                  className="group flex flex-col overflow-hidden rounded-xl border border-border bg-bg-card transition-colors hover:border-border-light hover:bg-bg-hover"
                >
                  {/* Cover image */}
                  <div className="relative aspect-[5/3] w-full overflow-hidden bg-bg-cell">
                    {coverSrc ? (
                      <Image
                        src={coverSrc}
                        alt={coverCard?.name ?? deck.name}
                        fill
                        sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, (max-width: 1280px) 33vw, 25vw"
                        className="object-cover transition-transform group-hover:scale-105"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center">
                        <Swords className="h-8 w-8 text-font-muted" />
                      </div>
                    )}
                    {/* Format badge */}
                    <span className="absolute top-2 right-2 rounded-md bg-black/60 px-2 py-0.5 text-[11px] font-medium text-white backdrop-blur-sm">
                      {deck.format}
                    </span>
                  </div>

                  {/* Deck info */}
                  <div className="flex flex-col gap-1 p-3.5">
                    <p className="truncate text-sm font-medium text-font-primary">
                      {deck.name}
                    </p>
                    <div className="flex items-center justify-between text-xs text-font-muted">
                      <span>{ownerName}</span>
                      <span className="flex items-center gap-1">
                        {deck.card_count != null && (
                          <>{deck.card_count} cards{" \u00b7 "}</>
                        )}
                        {timeAgo(deck.updated_at)}
                      </span>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      {/* Latest Cards */}
      <section>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-font-primary">
            Latest cards
          </h2>
          <Link
            href="/cards"
            className="flex items-center gap-1 text-sm text-font-accent hover:underline"
          >
            Show more <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {latestCards?.map((card) => (
            <Link
              key={card.id}
              href={`/cards?card=${card.id}`}
              className="group flex flex-col overflow-hidden rounded-xl border border-border bg-bg-card transition-colors hover:border-border-light hover:bg-bg-hover"
            >
              <div className="relative aspect-[488/680] w-full overflow-hidden bg-bg-cell">
                {card.image_normal || card.image_small ? (
                  <Image
                    src={(card.image_normal ?? card.image_small)!}
                    alt={card.name}
                    width={488}
                    height={680}
                    sizes="(max-width: 640px) 50vw, (max-width: 1024px) 25vw, 20vw"
                    className="h-full w-full object-cover transition-transform group-hover:scale-105"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center p-2 text-center text-xs text-font-muted">
                    {card.name}
                  </div>
                )}
              </div>
              <div className="p-2.5">
                <p className="truncate text-xs font-medium text-font-primary">
                  {card.name}
                </p>
                <p className="truncate text-[11px] text-font-muted">
                  {card.type_line}
                </p>
              </div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
