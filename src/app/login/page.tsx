"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  LuMail,
  LuLock,
  LuEye,
  LuEyeOff,
  LuArrowRight,
  LuBuilding2,
  LuLoader,
  LuCircleAlert,
} from "react-icons/lu";
import { Logo } from "@/components/Logo";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const form = new FormData(e.currentTarget);
    const email = String(form.get("email") || "").trim();
    const password = String(form.get("password") || "");

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    router.refresh();
    router.push("/dashboard");
  }

  return (
    <div className="min-h-screen grid lg:grid-cols-[1.05fr_1fr]">
      {/* ─── Left: editorial hero ────────────────────────────────── */}
      <aside className="relative hidden lg:flex flex-col justify-between overflow-hidden text-white bg-brand-gradient p-12 xl:p-16">
        <div className="absolute inset-0 bg-grid-soft opacity-90" />
        <div className="absolute -bottom-44 -left-24 size-[640px] rounded-full bg-accent-400/10 blur-[140px]" />
        <div className="absolute -top-32 -right-16 size-[480px] rounded-full bg-emerald-400/10 blur-[120px]" />

        <header className="relative z-10 flex items-center gap-3">
          <Logo className="h-9 w-9" />
          <div className="leading-tight">
            <p className="font-semibold tracking-tight">Our World Energy</p>
            <p className="text-[10px] uppercase tracking-[0.24em] text-emerald-100/55">
              Contractor Suite
            </p>
          </div>
        </header>

        <div className="relative z-10 max-w-xl">
          <span className="inline-flex items-center gap-2 rounded-full hairline-on-dark border bg-white/[0.04] backdrop-blur-sm px-3 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-emerald-100/85">
            <span className="size-1.5 rounded-full bg-accent-300" />
            Sustainable workforce
          </span>
          <h2 className="font-display mt-7 text-[44px] xl:text-[54px] leading-[1.05] tracking-tight text-white">
            A quieter way to manage{" "}
            <em className="italic text-accent-300 font-normal">
              the people who power the grid
            </em>
            .
          </h2>
          <p className="mt-6 text-emerald-100/80 text-[15px] leading-relaxed max-w-md">
            Contractors, attendance, payroll — every site in one calm,
            considered control room.
          </p>
        </div>

        <footer className="relative z-10 max-w-md">
          <div className="h-px bg-white/15" />
          <figure className="pt-5">
            <blockquote className="font-display italic text-[17px] leading-snug text-emerald-50/90">
              “The first platform our field managers actually trust.”
            </blockquote>
            <figcaption className="mt-4 flex items-center gap-3 text-[12px] text-emerald-100/70">
              <span className="size-7 rounded-full bg-linear-to-br from-accent-300 to-brand-700 grid place-items-center text-[10px] font-semibold text-brand-950">
                MR
              </span>
              <span>
                <span className="text-emerald-50/90 font-medium">Maya Rivera</span> ·
                Director of Operations, Eastern Grid
              </span>
            </figcaption>
          </figure>
        </footer>
      </aside>

      {/* ─── Right: form ─────────────────────────────────────────── */}
      <main className="relative bg-canvas bg-canvas-mesh flex flex-col">
        <div className="absolute inset-0 bg-paper-grain opacity-60 pointer-events-none" />

        <div className="lg:hidden relative z-10 px-6 pt-7 flex items-center gap-3">
          <Logo className="h-8 w-8" />
          <p className="font-semibold tracking-tight">Our World Energy</p>
        </div>

        <div className="relative z-10 flex-1 grid place-items-center px-6 py-14 lg:px-16">
          <div className="w-full max-w-[420px]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-brand-700">
              Sign in
            </p>
            <h1 className="font-display mt-3 text-[40px] leading-[1.05] tracking-tight text-ink-900">
              Welcome back.
            </h1>
            <p className="mt-3 text-ink-500 leading-relaxed">
              Pick up where you left off. Your sites are waiting.
            </p>

            <form className="mt-10 space-y-5" onSubmit={handleSubmit}>
              {error && (
                <div className="flex items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50/80 px-3.5 py-3 text-[13px] text-rose-900">
                  <LuCircleAlert
                    size={18}
                    strokeWidth={1.75}
                    className="mt-0.5 shrink-0 text-rose-600"
                  />
                  <div>
                    <p className="font-semibold">Sign-in failed</p>
                    <p className="text-rose-800/90">{error}</p>
                  </div>
                </div>
              )}

              {/* Email */}
              <div>
                <label
                  htmlFor="email"
                  className="block text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-500 mb-2"
                >
                  Email
                </label>
                <div className="relative">
                  <LuMail
                    size={18}
                    strokeWidth={1.75}
                    className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-400"
                  />
                  <input
                    id="email"
                    name="email"
                    type="email"
                    required
                    autoComplete="email"
                    disabled={loading}
                    placeholder="name@company.com"
                    className="w-full pl-11 pr-4 py-3.5 bg-paper hairline border rounded-xl text-[15px] text-ink-900 placeholder:text-ink-400 shadow-[0_1px_0_rgba(54,52,45,0.04)] ring-focus transition-shadow disabled:opacity-60"
                  />
                </div>
              </div>

              {/* Password */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label
                    htmlFor="password"
                    className="block text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-500"
                  >
                    Password
                  </label>
                  <Link
                    href="#"
                    className="text-[12px] font-medium text-brand-700 hover:text-brand-900 transition-colors"
                  >
                    Forgot?
                  </Link>
                </div>
                <div className="relative">
                  <LuLock
                    size={18}
                    strokeWidth={1.75}
                    className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-400"
                  />
                  <input
                    id="password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    required
                    autoComplete="current-password"
                    disabled={loading}
                    placeholder="••••••••••••"
                    className="w-full pl-11 pr-12 py-3.5 bg-paper hairline border rounded-xl text-[15px] text-ink-900 placeholder:text-ink-400 shadow-[0_1px_0_rgba(54,52,45,0.04)] ring-focus transition-shadow disabled:opacity-60"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={
                      showPassword ? "Hide password" : "Show password"
                    }
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1.5 text-ink-400 hover:text-ink-700 rounded-md hover:bg-ink-100 transition-colors"
                  >
                    {showPassword ? (
                      <LuEyeOff size={18} strokeWidth={1.75} />
                    ) : (
                      <LuEye size={18} strokeWidth={1.75} />
                    )}
                  </button>
                </div>
              </div>

              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  className="size-4 rounded border-ink-300 text-brand-800 focus:ring-brand-900/20"
                />
                <span className="text-sm text-ink-600">
                  Remember this device for 30 days
                </span>
              </label>

              <button
                type="submit"
                disabled={loading}
                className="group mt-2 w-full inline-flex items-center justify-center gap-2 rounded-xl bg-ink-900 hover:bg-ink-800 text-white font-medium text-[15px] py-3.5 shadow-[0_8px_24px_-12px_rgba(18,18,16,0.6)] transition-all active:scale-[0.99] focus:outline-none focus:ring-4 focus:ring-ink-900/15 disabled:opacity-70 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <>
                    <LuLoader
                      size={18}
                      strokeWidth={2}
                      className="animate-spin"
                    />
                    Signing in…
                  </>
                ) : (
                  <>
                    Sign in
                    <LuArrowRight
                      size={18}
                      strokeWidth={2}
                      className="transition-transform group-hover:translate-x-0.5"
                    />
                  </>
                )}
              </button>

              <div className="relative my-3">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t hairline border" />
                </div>
                <div className="relative flex justify-center">
                  <span className="bg-canvas px-3 text-[10px] uppercase tracking-[0.22em] text-ink-400">
                    or
                  </span>
                </div>
              </div>

              <button
                type="button"
                disabled
                title="SSO coming soon"
                className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-paper hairline border text-ink-500 font-medium py-3.5 cursor-not-allowed"
              >
                <LuBuilding2 size={18} strokeWidth={1.75} className="text-ink-400" />
                Continue with SSO
              </button>
            </form>

            <p className="mt-10 text-center text-[12px] text-ink-500 leading-relaxed">
              Authorized access only. By signing in you agree to our{" "}
              <Link
                href="#"
                className="text-ink-700 underline decoration-ink-300 underline-offset-2 hover:decoration-ink-700"
              >
                Terms
              </Link>{" "}
              &{" "}
              <Link
                href="#"
                className="text-ink-700 underline decoration-ink-300 underline-offset-2 hover:decoration-ink-700"
              >
                Privacy
              </Link>
              .
            </p>
          </div>
        </div>

        <footer className="relative z-10 px-6 lg:px-16 pb-6 flex items-center justify-between text-[11px] text-ink-400">
          <span className="inline-flex items-center gap-1.5">
            <span className="size-1.5 rounded-full bg-brand-500" />
            All systems operational
          </span>
          <div className="flex items-center gap-5">
            <button className="hover:text-ink-700 transition-colors">
              Support
            </button>
            <button className="hover:text-ink-700 transition-colors">
              English (US)
            </button>
          </div>
        </footer>
      </main>
    </div>
  );
}
