import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "@/lib/supabase/get-user";
import { Navbar } from "@/components/Navbar";
import { SidebarProvider } from "@/lib/contexts/SidebarContext";
import { MainContent } from "@/components/MainContent";
import { GoblinAIButton } from "@/components/goblinai/GoblinAIButton";

// Routes inside the (app) group that anon visitors may access. The deck
// detail page handles its own private/unlisted/public branching, so the
// layout-level auth gate skips it and lets the page decide.
const ANON_ALLOWED = [
  /^\/decks\/[^/]+\/?$/,
];

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Cached via React.cache() — child server components reuse this result
  // instead of triggering additional Supabase auth round-trips.
  const user = await getAuthenticatedUser();
  const pathname = (await headers()).get("x-pathname") ?? "";
  const anonAllowed = ANON_ALLOWED.some((re) => re.test(pathname));

  if (!user && !anonAllowed) redirect("/login");

  // For anon visitors landing on an unlisted/public deck we render a
  // minimal chrome (no Navbar / Sidebar / GoblinAI button) so the page
  // is recognizable as Adunata without exposing logged-in-only UI.
  if (!user) {
    return <div className="min-h-screen bg-bg-dark">{children}</div>;
  }

  return (
    <SidebarProvider>
      <div className="min-h-screen bg-bg-dark">
        <Navbar />
        <MainContent>{children}</MainContent>
      </div>
      <GoblinAIButton />
    </SidebarProvider>
  );
}
