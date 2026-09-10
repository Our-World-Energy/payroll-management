"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { accountCanAccessAdminPath } from "@/lib/accountPages";
import { homeForRole, normalizeRole, usesAdminConsole, normalizePages } from "@/lib/roles";
import { RoleProvider, type ConsoleAccount } from "./RoleContext";

// Cache the auth check result for the lifetime of the browser tab so
// navigating between /admin/* pages never re-runs the two round-trips. Holds
// the resolved account too, so the chrome doesn't have to look it up again.
let authCache: ConsoleAccount | "pending" | null = null;

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  // If already verified this tab, skip the loading flash entirely.
  const [account, setAccount] = useState<ConsoleAccount | null>(
    authCache && authCache !== "pending" ? authCache : null
  );

  useEffect(() => {
    const supabase = createClient();

    if (authCache && authCache !== "pending") {
      // Already verified — just wire up the sign-out listener.
      const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
        if (!session) { authCache = null; router.replace("/login"); }
      });
      return () => subscription.unsubscribe();
    }

    if (authCache === "pending") return; // another instance is already checking
    authCache = "pending";

    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        authCache = null;
        router.replace("/login");
        return;
      }

      const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (aal?.currentLevel !== "aal2") {
        authCache = null;
        router.replace("/two-factor");
        return;
      }

      // Read the account from the Auth server, not from the session. A
      // session's user_metadata is baked into the JWT at sign-in, so a role or
      // page change made in User Management wouldn't reach this browser until
      // the token happened to refresh. getUser() asks the server, so an edit
      // takes effect on the next page load.
      const { data: fresh } = await supabase.auth.getUser();
      const account = fresh?.user ?? session.user;

      const resolved = normalizeRole(account.user_metadata?.role);

      // Contractors have their own portal — the console is not theirs.
      if (!usesAdminConsole(resolved)) {
        authCache = null;
        router.replace(homeForRole(resolved));
        return;
      }

      const resolvedAccount: ConsoleAccount = {
        role: resolved,
        email: account.email ?? "",
        pages: normalizePages(account.user_metadata?.pages),
        rawPages: account.user_metadata?.pages,
      };
      authCache = resolvedAccount;
      setAccount(resolvedAccount);
    })();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) { authCache = null; router.replace("/login"); }
    });
    return () => subscription.unsubscribe();
  }, [router]);

  // Held to their own menu: HR or a Manager who types (or is linked to) a
  // route outside it lands back on their dashboard. Re-runs on navigation, so
  // a client-side push to a forbidden page is caught too.
  const allowed = account !== null && accountCanAccessAdminPath(account.role, account.rawPages, pathname);

  useEffect(() => {
    if (account === null || allowed) return;
    // Redirecting to a home the account also can't open would loop forever on
    // "Loading…" — accountNavItems guarantees a non-empty menu, but don't rely
    // on that from here.
    const home = homeForRole(account.role);
    if (home.replace(/\/+$/, "") === pathname.replace(/\/+$/, "")) return;
    router.replace(home);
  }, [account, allowed, router, pathname]);

  if (account === null || !allowed) {
    return (
      <div className="min-h-screen flex items-center justify-center text-slate-500">
        Loading…
      </div>
    );
  }

  return <RoleProvider account={account}>{children}</RoleProvider>;
}
