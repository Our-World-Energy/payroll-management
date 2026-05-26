import { redirect } from "next/navigation";
import { Sidebar } from "@/components/Sidebar";
import { Topbar } from "@/components/Topbar";
import { createClient } from "@/lib/supabase/server";

// Auth check reads cookies — the dashboard must render per-request.
export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <div className="min-h-screen bg-canvas">
      <Sidebar user={{ email: user.email ?? "", id: user.id }} />
      <div className="lg:pl-64">
        <Topbar />
        <main>{children}</main>
      </div>
    </div>
  );
}
