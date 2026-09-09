import { SidebarProvider } from "@/components/SidebarContext";
import { AdminThemeProvider } from "@/components/AdminThemeContext";
import { AdminLayoutClient } from "@/components/AdminLayoutClient";
import { ContractorConfigProvider } from "@/components/ContractorConfigContext";
import { AuthGuard } from "@/components/AuthGuard";
import { SalaryAccessProvider } from "@/components/SalaryAccessContext";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <ContractorConfigProvider>
        <SidebarProvider>
          <AdminThemeProvider>
            {/* Owns the "verify to view salary" popup and the canView flag the
                Payroll / Contractor Details pages mask money with. */}
            <SalaryAccessProvider>
              <AdminLayoutClient>{children}</AdminLayoutClient>
            </SalaryAccessProvider>
          </AdminThemeProvider>
        </SidebarProvider>
      </ContractorConfigProvider>
    </AuthGuard>
  );
}
