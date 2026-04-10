import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "@/lib/supabase/get-user";
import { Navbar } from "@/components/Navbar";

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
    <div className="min-h-screen bg-bg-dark">
      <Navbar />
      {/* Main content area - offset for sidebar on desktop, bottom bar on mobile */}
      <main className="pb-20 md:pb-0 md:pl-60">
        <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
          {children}
        </div>
      </main>
    </div>
  );
}
