import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "@/lib/supabase/get-user";
import { Navbar } from "@/components/Navbar";
import { SidebarProvider } from "@/lib/contexts/SidebarContext";
import { MainContent } from "@/components/MainContent";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Cached via React.cache() — child server components reuse this result
  // instead of triggering additional Supabase auth round-trips.
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");

  return (
    <SidebarProvider>
      <div className="min-h-screen bg-bg-dark">
        <Navbar />
        <MainContent>{children}</MainContent>
      </div>
    </SidebarProvider>
  );
}
