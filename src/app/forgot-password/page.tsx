"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { LuMail, LuKeyRound, LuMailCheck, LuLoaderCircle, LuArrowLeft } from "react-icons/lu";
import { createClient } from "@/lib/supabase/client";

// Step 1 of password recovery. Supabase Auth emails a one-time link that lands
// on /auth/callback, which turns it into a session and forwards to
// /reset-password where the new password is set. The redirect URL must be in
// the Supabase project's Auth → URL Configuration → Redirect URLs allowlist
// (one entry per environment, e.g. http://localhost:3000/** and the
// production origin) or Supabase silently falls back to the Site URL.
// useSearchParams() forces a client-side bailout during prerender, so Next
// requires it under a Suspense boundary — hence the thin wrapper.
export default function ForgotPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ForgotPasswordForm />
    </Suspense>
  );
}

function ForgotPasswordForm() {
  const searchParams = useSearchParams();
  const linkError = searchParams.get("error");

  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState(
    linkError === "link_expired" ? "That reset link is invalid or has expired — request a new one." : ""
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSending(true);
    const supabase = createClient();
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/auth/callback/?next=${encodeURIComponent("/reset-password/")}`,
    });
    setSending(false);
    if (resetError) {
      setError(resetError.message);
      return;
    }
    setSent(true);
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center p-6"
      style={{ fontFamily: "Inter, system-ui, sans-serif", background: "linear-gradient(135deg, #003527 0%, #006b5f 100%)" }}
    >
      <main className="relative z-10 w-full max-w-[430px]">
        <div className="rounded-xl shadow-2xl border border-white/20 bg-white p-8">
          <div className="text-center mb-6">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full" style={{ background: "#e6f4f1", color: "#006b5f" }}>
              {sent ? <LuMailCheck size={24} /> : <LuKeyRound size={24} />}
            </div>
            <h1 className="text-lg font-bold" style={{ color: "#191c1e" }}>
              {sent ? "Check your email" : "Forgot your password?"}
            </h1>
            <p className="text-sm mt-1" style={{ color: "#707974" }}>
              {sent
                ? <>If an account exists for <span className="font-semibold" style={{ color: "#003527" }}>{email.trim()}</span>, we&apos;ve sent a link to reset your password. The link is valid for a limited time and can be used once.</>
                : "Enter the email you sign in with and we'll send you a link to set a new password."}
            </p>
          </div>

          {!sent && (
            <form className="space-y-4" onSubmit={handleSubmit}>
              <div className="relative">
                <LuMail className="absolute left-4 top-1/2 -translate-y-1/2" style={{ color: "#707974" }} />
                <input
                  autoFocus
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); setError(""); }}
                  placeholder="name@company.com"
                  className="w-full pl-10 pr-4 py-3 rounded-lg text-base outline-none border focus:ring-2 focus:ring-teal-500"
                  style={{ borderColor: "#bfc9c3", color: "#191c1e" }}
                />
              </div>

              {error && (
                <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-center">{error}</p>
              )}

              <button
                type="submit"
                disabled={sending || !email.trim()}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-lg text-base font-semibold text-white shadow-md transition-all active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed"
                style={{ background: "#064e3b" }}
              >
                {sending ? <LuLoaderCircle size={18} className="animate-spin" /> : <LuMailCheck size={18} />}
                {sending ? "Sending…" : "Send reset link"}
              </button>
            </form>
          )}

          {sent && (
            <button
              type="button"
              onClick={() => { setSent(false); setError(""); }}
              className="w-full py-2.5 rounded-lg text-sm font-semibold border transition-colors hover:bg-slate-50"
              style={{ borderColor: "#bfc9c3", color: "#003527" }}
            >
              Didn&apos;t get it? Send again
            </button>
          )}

          <div className="mt-5 pt-4 border-t border-slate-100 text-center">
            <Link href="/login" className="inline-flex items-center gap-1.5 text-sm font-medium hover:underline" style={{ color: "#707974" }}>
              <LuArrowLeft size={14} /> Back to sign in
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
