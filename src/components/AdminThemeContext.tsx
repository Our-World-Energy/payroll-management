"use client";

import { createContext, useContext, useState } from "react";

type AdminThemeCtx = {
  dark: boolean;
  collapsed: boolean;
  toggleDark: () => void;
  toggleCollapsed: () => void;
};

const AdminThemeContext = createContext<AdminThemeCtx>({
  dark: false,
  collapsed: false,
  toggleDark: () => {},
  toggleCollapsed: () => {},
});

export function AdminThemeProvider({ children }: { children: React.ReactNode }) {
  const [dark, setDark] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  return (
    <AdminThemeContext.Provider
      value={{
        dark,
        collapsed,
        toggleDark: () => setDark((d) => !d),
        toggleCollapsed: () => setCollapsed((c) => !c),
      }}
    >
      {children}
    </AdminThemeContext.Provider>
  );
}

export function useAdminTheme() {
  return useContext(AdminThemeContext);
}
