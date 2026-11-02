import { redirect } from "next/navigation";
import { currentUser, supabaseServer } from "@/lib/supabase/server";
import { Nav } from "@/components/nav";
import { togglePause } from "./parametres/actions";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  if (!user) redirect("/login");
  const supabase = await supabaseServer();
  const { data: s } = await supabase.from("settings").select("automation_paused, mode, auto_send").eq("user_id", user.id).single();
  const paused = s?.automation_paused ?? false;

  return (
    <div className="mx-auto flex min-h-dvh max-w-6xl flex-col md:flex-row">
      <aside className="border-b border-line p-4 md:sticky md:top-0 md:self-start md:h-dvh md:w-56 md:shrink-0 md:border-b-0 md:border-r md:p-5">
        <div className="mb-4 flex items-center justify-between md:mb-8 md:block">
          <p className="font-semibold tracking-tight">Alternance Pilot</p>
        </div>
        <Nav />
        <form action={togglePause} className="mt-4 md:absolute md:bottom-5 md:left-5 md:right-5 md:mt-0">
          <p className="mb-2 flex items-center gap-2 text-xs text-muted">
            <span className={`size-2 rounded-full ${paused ? "bg-bad" : "bg-accent"}`} aria-hidden />
            {paused ? "Automatisations arrêtées" : s?.mode === "test" ? "Actif, mode test" : "Actif, en production"}
          </p>
          <button className={paused ? "btn w-full" : "btn-danger w-full"}>
            {paused ? "Relancer les automatisations" : "Tout arrêter"}
          </button>
        </form>
      </aside>
      <main className="flex-1 px-5 py-8 md:px-10">{children}</main>
    </div>
  );
}
