"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { LuShieldCheck, LuLoaderCircle, LuKeyRound } from "react-icons/lu";

type Mode = "loading" | "enroll" | "challenge";

// Mandatory TOTP step that sits between password login and /admin.
// - No factor yet  -> enroll (show QR, verify a code to activate).
// - Verified factor -> challenge (enter a code to elevate the session to aal2).
export default function TwoFactorPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("loading");
  const [factorId, setFactorId] = useState("");
  const [qrCode, setQrCode] = useState("");
  const [secret, setSecret] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [verifying, setVerifying] = useState(false);

  useEffect(() => {
    const supabase = createClient();

    (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        router.replace("/login");
        return;
      }

      const { data: aal } =
        await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (aal?.currentLevel === "aal2") {
        router.replace("/admin");
        return;
      }

      const { data: factors, error: listError } =
        await supabase.auth.mfa.listFactors();
      if (listError) {
        setError(listError.message);
        return;
      }

      const verified = factors.all.filter(
        (f) => f.factor_type === "totp" && f.status === "verified"
      );

      if (verified.length > 0) {
        setFactorId(verified[0].id);
        setMode("challenge");
        return;
      }

      // No verified factor: clear any abandoned (unverified) factors, then enroll.
      const stale = factors.all.filter((f) => f.status === "unverified");
      await Promise.all(
        stale.map((f) => supabase.auth.mfa.unenroll({ factorId: f.id }))
      );

      const { data: enrolled, error: enrollError } =
        await supabase.auth.mfa.enroll({ factorType: "totp" });
      if (enrollError) {
        setError(enrollError.message);
        return;
      }

      setFactorId(enrolled.id);
      setQrCode(enrolled.totp.qr_code);
      setSecret(enrolled.totp.secret);
      setMode("enroll");
    })();
  }, [router]);

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace("/login");
  }

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setVerifying(true);

    const supabase = createClient();
    const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({
      factorId,
      code: code.trim(),
    });

    if (verifyError) {
      setError(verifyError.message);
      setCode("");
      setVerifying(false);
      return;
    }

    router.replace("/admin");
    router.refresh();
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center p-6"
      style={{
        fontFamily: "Inter, system-ui, sans-serif",
        background: "linear-gradient(135deg, #003527 0%, #006b5f 100%)",
      }}
    >
      <main className="relative z-10 w-full max-w-[430px]">
        <div className="rounded-xl shadow-2xl border border-white/20 bg-white p-8">
          <div className="text-center mb-6">
            <div
              className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full"
              style={{ background: "#e6f4f1", color: "#006b5f" }}
            >
              <LuShieldCheck size={24} />
            </div>
            <h1 className="text-lg font-bold" style={{ color: "#191c1e" }}>
              Two-Factor Authentication
            </h1>
            <p className="text-sm mt-1" style={{ color: "#707974" }}>
              {mode === "enroll"
                ? "Scan the QR code with an authenticator app, then enter the 6-digit code to finish setup."
                : mode === "challenge"
                ? "Enter the 6-digit code from your authenticator app."
                : "Loading…"}
            </p>
          </div>

          {mode === "loading" && (
            <div className="flex justify-center py-8" style={{ color: "#006b5f" }}>
              <LuLoaderCircle size={28} className="animate-spin" />
            </div>
          )}

          {mode === "enroll" && qrCode && (
            <div className="mb-5 flex flex-col items-center">
              {/* qr_code is an inline SVG data URI returned by Supabase */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={qrCode}
                alt="Authenticator QR code"
                className="h-44 w-44 rounded-lg border border-slate-200"
              />
              <div className="mt-3 text-center">
                <p className="text-xs" style={{ color: "#707974" }}>
                  Or enter this code manually:
                </p>
                <code className="text-xs font-mono break-all" style={{ color: "#404944" }}>
                  {secret}
                </code>
              </div>
            </div>
          )}

          {(mode === "enroll" || mode === "challenge") && (
            <form className="space-y-4" onSubmit={handleVerify}>
              <div className="relative">
                <LuKeyRound
                  className="absolute left-4 top-1/2 -translate-y-1/2"
                  style={{ color: "#707974" }}
                />
                <input
                  autoFocus
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]*"
                  maxLength={6}
                  required
                  value={code}
                  onChange={(e) => {
                    setCode(e.target.value.replace(/\D/g, ""));
                    setError("");
                  }}
                  placeholder="123456"
                  className="w-full pl-10 pr-4 py-3 rounded-lg text-base tracking-[0.4em] text-center outline-none border"
                  style={{ borderColor: "#bfc9c3", color: "#191c1e" }}
                />
              </div>

              {error && (
                <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-center">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={verifying || code.length < 6}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-lg text-base font-semibold text-white shadow-md transition-all active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed"
                style={{ background: "#064e3b" }}
              >
                {verifying ? "Verifying…" : "Verify"}
                <LuShieldCheck className="text-base" />
              </button>
            </form>
          )}

          {mode !== "loading" && (
            <div className="mt-5 pt-4 border-t border-slate-100 text-center">
              <button
                type="button"
                onClick={handleSignOut}
                className="text-sm font-medium hover:underline"
                style={{ color: "#707974" }}
              >
                Sign out
              </button>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
