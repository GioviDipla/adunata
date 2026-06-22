import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export const metadata = {
  title: "Adunata — piattaforma per giocatori di Magic: The Gathering",
  description:
    "Adunata è una web app gratuita per costruire mazzi di Magic: The Gathering, fare goldfish e giocare partite 1v1 in tempo reale con gli amici. Con GoblinAI, l'assistente IA per le regole di MTG.",
};

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    redirect("/dashboard");
  }

  redirect("/login");
}
