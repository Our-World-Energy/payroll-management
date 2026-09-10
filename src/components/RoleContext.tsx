"use client";

import { createContext, useContext } from "react";
import type { AppRole, PortalPageKey } from "@/lib/roles";

export type ConsoleAccount = {
  role: AppRole;
  email: string;
  /** The four personal pages this account may open. */
  pages: PortalPageKey[];
  /** user_metadata.pages verbatim — undefined means "never set", which the
   *  guards read as the role's own defaults. */
  rawPages: unknown;
};

/**
 * The signed-in account, resolved once by AuthGuard and read by the console
 * chrome (sidebar menus, topbar) so neither has to re-fetch the session. The
 * role defaults to "admin" for the same reason normalizeRole does.
 */
const AccountContext = createContext<ConsoleAccount>({ role: "admin", email: "", pages: [], rawPages: undefined });

export function RoleProvider({ account, children }: { account: ConsoleAccount; children: React.ReactNode }) {
  return <AccountContext.Provider value={account}>{children}</AccountContext.Provider>;
}

export function useAccount(): ConsoleAccount {
  return useContext(AccountContext);
}

export function useRole(): AppRole {
  return useContext(AccountContext).role;
}
