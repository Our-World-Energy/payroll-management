import { AdminSidebar } from "@/components/AdminSidebar";
import { AdminTopbar } from "@/components/AdminTopbar";
import { SidebarProvider } from "@/components/SidebarContext";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <div className="min-h-screen bg-slate-50">
        <AdminSidebar />
        <div className="lg:ml-64">
          <AdminTopbar />
          <main>{children}</main>
        </div>
      </div>
    </SidebarProvider>
  );
}
