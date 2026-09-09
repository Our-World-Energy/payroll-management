"use client";

import { createContext, useContext } from "react";
import type { AppRole } from "@/lib/roles";

export type ConsoleAccount = { role: AppRole; email: string };

/**
 * The signed-in account, resolved once by AuthGuard and read by the console
 * chrome (sidebar menus, topbar) so neither has to re-fetch the session. The
 * role defaults to "admin" for the same reason normalizeRole does.
 */
const AccountContext = createContext<ConsoleAccount>({ role: "admin", email: "" });

export function RoleProvider({ account, children }: { account: ConsoleAccount; children: React.ReactNode }) {
  return <AccountContext.Provider value={account}>{children}</AccountContext.Provider>;
}

export function useAccount(): ConsoleAccount {
  return useContext(AccountContext);
}

export function useRole(): AppRole {
  return useContext(AccountContext).role;
}
