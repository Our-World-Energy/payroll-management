import { SidebarProvider } from "@/components/SidebarContext";
import { AdminThemeProvider } from "@/components/AdminThemeContext";
import { AdminLayoutClient } from "@/components/AdminLayoutClient";
import { ContractorConfigProvider } from "@/components/ContractorConfigContext";
import { AuthGuard } from "@/components/AuthGuard";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <ContractorConfigProvider>
        <SidebarProvider>
          <AdminThemeProvider>
            <AdminLayoutClient>{children}</AdminLayoutClient>
          </AdminThemeProvider>
        </SidebarProvider>
      </ContractorConfigProvider>
    </AuthGuard>
  );
}
