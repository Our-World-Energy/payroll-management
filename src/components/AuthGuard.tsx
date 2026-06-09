"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// Cache the auth check result for the lifetime of the browser tab so
// navigating between /admin/* pages never re-runs the two round-trips.
let authCache: "ok" | "pending" | null = null;

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  // If already verified this tab, skip the loading flash entirely.
  const [checked, setChecked] = useState(authCache === "ok");

  useEffect(() => {
    const supabase = createClient();

    if (authCache === "ok") {
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

      authCache = "ok";
      setChecked(true);
    })();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) { authCache = null; router.replace("/login"); }
    });
    return () => subscription.unsubscribe();
  }, [router]);

  if (!checked) {
    return (
      <div className="min-h-screen flex items-center justify-center text-slate-500">
        Loading…
      </div>
    );
  }

  return <>{children}</>;
}
