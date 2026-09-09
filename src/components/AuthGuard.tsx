"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { canAccessAdminPath } from "@/lib/adminNav";
import { homeForRole, normalizeRole, usesAdminConsole } from "@/lib/roles";
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

      const resolved = normalizeRole(session.user.user_metadata?.role);

      // Contractors have their own portal — the console is not theirs.
      if (!usesAdminConsole(resolved)) {
        authCache = null;
        router.replace(homeForRole(resolved));
        return;
      }

      const resolvedAccount: ConsoleAccount = { role: resolved, email: session.user.email ?? "" };
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
  const allowed = account !== null && canAccessAdminPath(account.role, pathname);

  useEffect(() => {
    if (account !== null && !allowed) router.replace(homeForRole(account.role));
  }, [account, allowed, router]);

  if (account === null || !allowed) {
    return (
      <div className="min-h-screen flex items-center justify-center text-slate-500">
        Loading…
      </div>
    );
  }

  return <RoleProvider account={account}>{children}</RoleProvider>;
}
