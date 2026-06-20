import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthenticatedUser } from "@/lib/supabase/get-user";
import { CARD_GRID_COLUMNS, DECK_PICKER_COLUMNS } from "@/lib/supabase/columns";
import { Swords, ArrowRight, Clock, Users, Heart } from "lucide-react";
import { redirect } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import CardBrowser from "@/components/cards/CardBrowser";
import type { Database } from "@/types/supabase";

type Card = Database["public"]["Tables"]["cards"]["Row"];
type SetInfo = { set_code: string; set_name: string; latest_release: string };

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

async function getPublicCardsData(): Promise<{
  initialCards: Card[];
  sets: SetInfo[];
}> {
  const admin = createAdminClient();
  const [cardsRes, setsRes] = await Promise.all([
    admin
      .from("cards")
      .select(CARD_GRID_COLUMNS)
      .order("released_at", { ascending: false, nullsFirst: false })
      .order("id", { ascending: false })
      .limit(40),
    admin.rpc("get_distinct_sets"),
  ]);
  if (cardsRes.error)
    console.error("dashboard cards failed:", cardsRes.error.message);
  if (setsRes.error)
    console.error("dashboard sets failed:", setsRes.error.message);
  return {
    initialCards: (cardsRes.data || []) as unknown as Card[],
    sets: (setsRes.data as SetInfo[]) || [],
  };
}

export default async function DashboardPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");

  const supabase = await createClient();
  const admin = createAdminClient();

  // ── Batch 1: all independent queries ──
  const [
    { data: profile },
    { data: myDecks },
    { data: publicDecks },
    { data: activeGames },
    publicCardsData,
    { data: userDecks },
    { data: likedRows },
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select("username, display_name")
      .eq("id", user.id)
      .single(),
    supabase
      .from("decks")
      .select("id, name, format, updated_at, card_count, cover_card_id")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false })
      .limit(4),
    supabase
      .from("decks")
      .select("id, name, format, updated_at, card_count, user_id, cover_card_id")
      .in("visibility", ["public", "unlisted"])
      .order("updated_at", { ascending: false })
      .limit(4),
    supabase
      .from("game_lobbies")
      .select("id, name, format, status, host_user_id, created_at")
      .in("status", ["waiting", "playing"])
      .order("created_at", { ascending: false })
      .limit(6),
    getPublicCardsData(),
    supabase
      .from("decks")
      .select(DECK_PICKER_COLUMNS)
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false }),
    supabase
      .from("card_likes")
      .select("card_id")
      .eq("user_id", user.id),
  ]);

  const likedIds = (likedRows || []).map((r) => r.card_id);

  // ── Batch 2: resolve covers + liked card images ──
  const coverIds = [
    ...new Set(
      [
        ...(myDecks ?? []),
        ...(publicDecks ?? []),
      ]
        .map((d) => d.cover_card_id)
        .filter((id): id is number => id != null),
    ),
  ];

  const likedCardIds = likedIds.slice(0, 8).map(Number);

  const [{ data: coverCards }, { data: likedCards }] = await Promise.all([
    coverIds.length > 0
      ? admin
          .from("cards")
          .select("id, name, image_art_crop, image_normal")
          .in("id", coverIds)
      : { data: [] },
    likedCardIds.length > 0
      ? admin
          .from("cards")
          .select("id, name, image_normal, image_small, type_line, mana_cost")
          .in("id", likedCardIds)
          .order("released_at", { ascending: false })
      : { data: [] },
  ]);

  const coverMap = new Map(
    (coverCards ?? []).map((c) => [c.id, c]),
  );

  // Resolve public deck owner usernames
  const publicOwnerIds = [
    ...new Set((publicDecks ?? []).map((d) => d.user_id)),
  ];
  const gameHostIds = [
    ...new Set(
      (activeGames ?? []).map((g) => g.host_user_id).filter(Boolean),
    ),
  ];
  const allUserIds = [...new Set([...publicOwnerIds, ...gameHostIds])];

  const { data: allProfiles } =
    allUserIds.length > 0
      ? await supabase
          .from("profiles")
          .select("id, username, display_name")
          .in("id", allUserIds)
      : { data: [] };

  const profileMap = new Map(
    (allProfiles ?? []).map((p) => [p.id, p]),
  );

  const displayName =
    profile?.display_name || profile?.username || user.email;
  const firstName =
    displayName !== user.email ? displayName!.split(" ")[0] : null;

  const hasGames = (activeGames?.length ?? 0) > 0;
  const hasMyDecks = (myDecks?.length ?? 0) > 0;
  const hasPublicDecks = (publicDecks?.length ?? 0) > 0;
  const hasLikedCards = (likedCards?.length ?? 0) > 0;

  return (
    <div className="flex flex-col gap-10">
      {/* Welcome */}
      <div>
        <h1 className="text-2xl font-bold text-font-primary">
          Welcome back{firstName ? `, ${firstName}` : ""}
        </h1>
        <p className="mt-1 text-sm text-font-secondary">{user.email}</p>
      </div>

      {/* Browse Card Database */}
      <section>
        <CardBrowser
          initialCards={publicCardsData.initialCards}
          sets={publicCardsData.sets}
          userDecks={userDecks || []}
          initialLikedIds={likedIds}
        />
      </section>

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

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
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

      {/* My Decks + Public Decks side by side */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* My Recent Decks */}
        <section>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-font-primary">
              My recent decks
            </h2>
            {hasMyDecks && (
              <Link
                href="/decks"
                className="flex items-center gap-1 text-sm text-font-accent hover:underline"
              >
                View all <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            )}
          </div>

          {!hasMyDecks ? (
            <div className="rounded-xl border border-border bg-bg-card p-8 text-center">
              <Swords className="mx-auto h-10 w-10 text-font-muted" />
              <p className="mt-3 text-sm text-font-secondary">
                No decks yet. Create your first deck to get started.
              </p>
              <Link
                href="/decks/new"
                className="mt-4 inline-flex items-center gap-2 rounded-lg bg-bg-accent px-4 py-2 text-sm font-medium text-font-white transition-colors hover:bg-bg-accent-dark"
              >
                Create deck
              </Link>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {myDecks!.map((deck) => {
                const coverCard = deck.cover_card_id
                  ? coverMap.get(deck.cover_card_id)
                  : null;
                const coverSrc =
                  coverCard?.image_art_crop ??
                  coverCard?.image_normal ??
                  null;

                return (
                  <Link
                    key={deck.id}
                    href={`/decks/${deck.id}`}
                    className="group flex gap-4 rounded-xl border border-border bg-bg-card p-4 transition-colors hover:border-border-light hover:bg-bg-hover"
                  >
                    <div className="relative h-16 w-24 shrink-0 overflow-hidden rounded-lg bg-bg-cell">
                      {coverSrc ? (
                        <Image
                          src={coverSrc}
                          alt={coverCard?.name ?? deck.name}
                          fill
                          sizes="96px"
                          className="object-cover transition-transform group-hover:scale-105"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center">
                          <Swords className="h-5 w-5 text-font-muted" />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-font-primary">
                        {deck.name}
                      </p>
                      <p className="text-xs text-font-muted">
                        {deck.format}
                        {deck.card_count != null && (
                          <>{" \u00b7 "}{deck.card_count} cards</>
                        )}
                      </p>
                      <p className="mt-1 text-[11px] text-font-muted">
                        Updated {timeAgo(deck.updated_at)}
                      </p>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </section>

        {/* Latest Public Decks */}
        <section>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-font-primary">
              Latest public decks
            </h2>
          </div>

          {!hasPublicDecks ? (
            <div className="rounded-xl border border-border bg-bg-card p-8 text-center">
              <Swords className="mx-auto h-10 w-10 text-font-muted" />
              <p className="mt-3 text-sm text-font-secondary">
                No public decks yet.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {publicDecks!.map((deck) => {
                const coverCard = deck.cover_card_id
                  ? coverMap.get(deck.cover_card_id)
                  : null;
                const coverSrc =
                  coverCard?.image_art_crop ??
                  coverCard?.image_normal ??
                  null;
                const owner = profileMap.get(deck.user_id);
                const ownerName =
                  owner?.display_name || owner?.username || "Unknown";

                return (
                  <Link
                    key={deck.id}
                    href={`/decks/${deck.id}`}
                    className="group flex gap-4 rounded-xl border border-border bg-bg-card p-4 transition-colors hover:border-border-light hover:bg-bg-hover"
                  >
                    <div className="relative h-16 w-24 shrink-0 overflow-hidden rounded-lg bg-bg-cell">
                      {coverSrc ? (
                        <Image
                          src={coverSrc}
                          alt={coverCard?.name ?? deck.name}
                          fill
                          sizes="96px"
                          className="object-cover transition-transform group-hover:scale-105"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center">
                          <Swords className="h-5 w-5 text-font-muted" />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-font-primary">
                        {deck.name}
                      </p>
                      <p className="text-xs text-font-muted">
                        {deck.format}
                        {deck.card_count != null && (
                          <>{" \u00b7 "}{deck.card_count} cards</>
                        )}
                      </p>
                      <p className="mt-1 text-[11px] text-font-muted">
                        {ownerName}{" \u00b7 "}{timeAgo(deck.updated_at)}
                      </p>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {/* Liked Cards */}
      {hasLikedCards && (
        <section>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-font-primary">
              <Heart className="inline h-4 w-4 mr-1.5 text-bg-red" />
              Liked cards
            </h2>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
            {likedCards!.map((card) => (
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
                      sizes="(max-width: 640px) 50vw, (max-width: 1024px) 25vw, 12.5vw"
                      className="h-full w-full object-cover transition-transform group-hover:scale-105"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center p-2 text-center text-xs text-font-muted">
                      {card.name}
                    </div>
                  )}
                </div>
                <div className="p-2">
                  <p className="truncate text-[11px] font-medium text-font-primary">
                    {card.name}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* No liked cards empty state */}
      {!hasLikedCards && (
        <section>
          <div className="mb-4">
            <h2 className="text-lg font-semibold text-font-primary">
              <Heart className="inline h-4 w-4 mr-1.5 text-bg-red" />
              Liked cards
            </h2>
          </div>
          <div className="rounded-xl border border-border bg-bg-card p-6 text-center">
            <Heart className="mx-auto h-8 w-8 text-font-muted" />
            <p className="mt-2 text-sm text-font-secondary">
              No liked cards yet. Browse cards and tap the heart to save favorites.
            </p>
          </div>
        </section>
      )}
    </div>
  );
}
