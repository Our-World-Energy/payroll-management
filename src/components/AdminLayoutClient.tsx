"use client";

import { AdminSidebar } from "./AdminSidebar";
import { AdminTopbar } from "./AdminTopbar";
import { useAdminTheme } from "./AdminThemeContext";

export function AdminLayoutClient({ children }: { children: React.ReactNode }) {
  const { dark, collapsed } = useAdminTheme();

  const pageBg = dark ? "bg-[#111a15]" : "bg-slate-50";
  const ml = collapsed ? "lg:ml-17" : "lg:ml-64";

  return (
    <div className={`min-h-screen ${pageBg} transition-colors duration-300 admin-page`} data-theme={dark ? "dark" : "light"}>
      <AdminSidebar />
      <div className={`${ml} transition-all duration-300`}>
        <AdminTopbar />
        <main>{children}</main>
      </div>
    </div>
  );
}
