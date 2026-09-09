"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LuLock, LuEye, LuEyeOff, LuShieldCheck, LuKeyRound, LuLoaderCircle, LuCircleCheck } from "react-icons/lu";
import { createClient } from "@/lib/supabase/client";

type Mode = "loading" | "totp" | "password" | "done";

// Step 2 of password recovery, reached from the emailed link via
// /auth/callback. The recovery session is aal1; Supabase refuses a password
// change on an aal1 session when the account has a verified authenticator
// (insufficient_aal), so users with TOTP set up confirm a code here first —
// which also means a stolen reset email alone can't take over a 2FA account.
export default function ResetPasswordPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("loading");
  const [factorId, setFactorId] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.replace("/forgot-password?error=link_expired");
        return;
      }
      const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (aal?.nextLevel === "aal2" && aal.currentLevel !== "aal2") {
        const { data: factors } = await supabase.auth.mfa.listFactors();
        const verified = factors?.all.find((f) => f.factor_type === "totp" && f.status === "verified");
        if (verified) {
          setFactorId(verified.id);
          setMode("totp");
          return;
        }
      }
      setMode("password");
    })();
  }, [router]);

  async function handleTotp(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const supabase = createClient();
    const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({ factorId, code: code.trim() });
    setBusy(false);
    if (verifyError) { setError(verifyError.message); setCode(""); return; }
    setMode("password");
  }

  async function handlePassword(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (password.length < 8) { setError("Use at least 8 characters."); return; }
    if (password !== confirm) { setError("The two passwords don't match."); return; }
    setBusy(true);
    const supabase = createClient();
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (updateError) {
      setError(
        updateError.message.toLowerCase().includes("aal2") || updateError.code === "insufficient_aal"
          ? "Two-factor confirmation is required before changing the password. Please start over from the reset link."
          : updateError.message
      );
      return;
    }
    setMode("done");
  }

  function continueToApp() {
    // The session is live; /two-factor enrolls or challenges as needed and
    // then routes by role, exactly like a normal sign-in.
    router.replace("/two-factor");
    router.refresh();
  }

  const inputStyle = { borderColor: "#bfc9c3", color: "#191c1e" };

  return (
    <div
      className="min-h-screen flex items-center justify-center p-6"
      style={{ fontFamily: "Inter, system-ui, sans-serif", background: "linear-gradient(135deg, #003527 0%, #006b5f 100%)" }}
    >
      <main className="relative z-10 w-full max-w-[430px]">
        <div className="rounded-xl shadow-2xl border border-white/20 bg-white p-8">
          <div className="text-center mb-6">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full" style={{ background: "#e6f4f1", color: "#006b5f" }}>
              {mode === "done" ? <LuCircleCheck size={24} /> : mode === "totp" ? <LuShieldCheck size={24} /> : <LuLock size={24} />}
            </div>
            <h1 className="text-lg font-bold" style={{ color: "#191c1e" }}>
              {mode === "done" ? "Password updated" : mode === "totp" ? "Confirm it's you" : "Set a new password"}
            </h1>
            <p className="text-sm mt-1" style={{ color: "#707974" }}>
              {mode === "loading" && "Checking your reset link…"}
              {mode === "totp" && "Enter the 6-digit code from your authenticator app to continue."}
              {mode === "password" && "Choose a new password for your account. At least 8 characters."}
              {mode === "done" && "You can now continue to the app with your new password."}
            </p>
          </div>

          {mode === "loading" && (
            <div className="flex justify-center py-8" style={{ color: "#006b5f" }}>
              <LuLoaderCircle size={28} className="animate-spin" />
            </div>
          )}

          {mode === "totp" && (
            <form className="space-y-4" onSubmit={handleTotp}>
              <div className="relative">
                <LuKeyRound className="absolute left-4 top-1/2 -translate-y-1/2" style={{ color: "#707974" }} />
                <input
                  autoFocus
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]*"
                  maxLength={6}
                  required
                  value={code}
                  onChange={(e) => { setCode(e.target.value.replace(/\D/g, "")); setError(""); }}
                  placeholder="123456"
                  className="w-full pl-10 pr-4 py-3 rounded-lg text-base tracking-[0.4em] text-center outline-none border focus:ring-2 focus:ring-teal-500"
                  style={inputStyle}
                />
              </div>
              {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-center">{error}</p>}
              <button
                type="submit"
                disabled={busy || code.length < 6}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-lg text-base font-semibold text-white shadow-md transition-all active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed"
                style={{ background: "#064e3b" }}
              >
                {busy ? <LuLoaderCircle size={18} className="animate-spin" /> : <LuShieldCheck size={18} />}
                {busy ? "Verifying…" : "Verify"}
              </button>
            </form>
          )}

          {mode === "password" && (
            <form className="space-y-4" onSubmit={handlePassword}>
              <div className="relative">
                <LuLock className="absolute left-4 top-1/2 -translate-y-1/2" style={{ color: "#707974" }} />
                <input
                  autoFocus
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setError(""); }}
                  placeholder="New password"
                  className="w-full pl-10 pr-12 py-3 rounded-lg text-base outline-none border focus:ring-2 focus:ring-teal-500"
                  style={inputStyle}
                />
                <button type="button" onClick={() => setShowPassword((v) => !v)} className="absolute right-4 top-1/2 -translate-y-1/2" style={{ color: "#707974" }} aria-label={showPassword ? "Hide password" : "Show password"}>
                  {showPassword ? <LuEyeOff size={16} /> : <LuEye size={16} />}
                </button>
              </div>
              <div className="relative">
                <LuLock className="absolute left-4 top-1/2 -translate-y-1/2" style={{ color: "#707974" }} />
                <input
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  required
                  minLength={8}
                  value={confirm}
                  onChange={(e) => { setConfirm(e.target.value); setError(""); }}
                  placeholder="Confirm new password"
                  className="w-full pl-10 pr-4 py-3 rounded-lg text-base outline-none border focus:ring-2 focus:ring-teal-500"
                  style={inputStyle}
                />
              </div>
              {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-center">{error}</p>}
              <button
                type="submit"
                disabled={busy || password.length < 8 || confirm.length < 8}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-lg text-base font-semibold text-white shadow-md transition-all active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed"
                style={{ background: "#064e3b" }}
              >
                {busy ? <LuLoaderCircle size={18} className="animate-spin" /> : <LuLock size={18} />}
                {busy ? "Saving…" : "Update password"}
              </button>
            </form>
          )}

          {mode === "done" && (
            <button
              type="button"
              onClick={continueToApp}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-lg text-base font-semibold text-white shadow-md transition-all active:scale-[0.98]"
              style={{ background: "#064e3b" }}
            >
              Continue <LuShieldCheck size={18} />
            </button>
          )}
        </div>
      </main>
    </div>
  );
}
