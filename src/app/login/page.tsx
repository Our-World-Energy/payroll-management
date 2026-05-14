"use client";

import { useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  LuMail,
  LuLock,
  LuEye,
  LuEyeOff,
  LuLogIn,
  LuCircleHelp,
  LuGlobe,
} from "react-icons/lu";

export default function LoginPage() {
  const [showPassword, setShowPassword] = useState(false);
  const router = useRouter();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    router.push("/");
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center p-6 relative"
      style={{ fontFamily: "Inter, system-ui, sans-serif" }}
    >
      {/* Background */}
      <div className="fixed inset-0 z-0">
        {/* Solar farm photo */}
        <img
          src="/login-bg.jpg"
          alt=""
          aria-hidden="true"
          className="absolute inset-0 w-full h-full object-cover"
        />
        {/* Dark green gradient overlay */}
        <div
          className="absolute inset-0"
          style={{
            background: "linear-gradient(135deg, #003527 0%, #006b5f 100%)",
            opacity: 0.92,
            mixBlendMode: "multiply",
          }}
        />
        {/* dot grid */}
        <div
          className="absolute inset-0 opacity-10"
          style={{
            backgroundImage:
              "radial-gradient(circle at 2px 2px, white 1px, transparent 0)",
            backgroundSize: "40px 40px",
          }}
        />
      </div>

      {/* Card */}
      <main className="relative z-10 w-full max-w-[430px]">
        <div
          className="rounded-xl shadow-2xl border border-white/20 p-8"
          style={{
            background: "#fff",
            backdropFilter: "blur(10px)",
          }}
        >
          {/* Branding */}
          <div className="text-center mb-6">
            <Image
              src="/logo.svg"
              alt="Our World Energy"
              width={220}
              height={44}
              className="mx-auto mb-4"
              priority
            />
            <p
              className="text-xs font-semibold tracking-widest uppercase"
              style={{ color: "#707974" }}
            >
              Contractor Management System
            </p>
          </div>

          {/* Form */}
          <form className="space-y-4" onSubmit={handleSubmit}>
            {/* Email */}
            <div className="space-y-2">
              <label
                htmlFor="email"
                className="block text-sm font-semibold"
                style={{ color: "#404944" }}
              >
                Email Address
              </label>
              <div className="relative">
                <LuMail
                  className="absolute left-4 top-1/2 -translate-y-1/2 text-base"
                  style={{ color: "#707974" }}
                />
                <input
                  id="email"
                  name="email"
                  type="email"
                  required
                  placeholder="name@company.com"
                  className="w-full pl-10 pr-4 py-3 rounded-lg text-base outline-none transition-all border"
                  style={{
                    background: "#ffffff",
                    borderColor: "#bfc9c3",
                    color: "#191c1e",
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = "#006b5f";
                    e.currentTarget.style.boxShadow =
                      "0 0 0 2px rgba(0,107,95,0.25)";
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = "#bfc9c3";
                    e.currentTarget.style.boxShadow = "none";
                  }}
                />
              </div>
            </div>

            {/* Password */}
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <label
                  htmlFor="password"
                  className="text-sm font-semibold"
                  style={{ color: "#404944" }}
                >
                  Password
                </label>
                <a
                  href="#"
                  className="text-xs font-medium hover:underline"
                  style={{ color: "#006b5f" }}
                >
                  Forgot Password?
                </a>
              </div>
              <div className="relative">
                <LuLock
                  className="absolute left-4 top-1/2 -translate-y-1/2 text-base"
                  style={{ color: "#707974" }}
                />
                <input
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  required
                  placeholder="••••••••"
                  className="w-full pl-10 pr-12 py-3 rounded-lg text-base outline-none transition-all border"
                  style={{
                    background: "#ffffff",
                    borderColor: "#bfc9c3",
                    color: "#191c1e",
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = "#006b5f";
                    e.currentTarget.style.boxShadow =
                      "0 0 0 2px rgba(0,107,95,0.25)";
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = "#bfc9c3";
                    e.currentTarget.style.boxShadow = "none";
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 hover:text-brand-700 transition-colors"
                  style={{ color: "#707974" }}
                >
                  {showPassword ? (
                    <LuEyeOff className="text-base" />
                  ) : (
                    <LuEye className="text-base" />
                  )}
                </button>
              </div>
            </div>

            {/* Remember me */}
            <div className="flex items-center gap-2">
              <input
                id="remember"
                type="checkbox"
                className="w-4 h-4 rounded border accent-brand-700"
                style={{ borderColor: "#bfc9c3" }}
              />
              <label
                htmlFor="remember"
                className="text-sm"
                style={{ color: "#404944" }}
              >
                Remember this device for 30 days
              </label>
            </div>

            {/* Sign In button */}
            <button
              type="submit"
              className="w-full flex items-center justify-center gap-2 py-3 rounded-lg text-base font-semibold text-white shadow-md transition-all active:scale-[0.98]"
              style={{ background: "#064e3b" }}
              onMouseEnter={(e) =>
                (e.currentTarget.style.background = "#003527")
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.background = "#064e3b")
              }
            >
              Sign In
              <LuLogIn className="text-base" />
            </button>
          </form>

          {/* Footer */}
          <div
            className="mt-6 pt-5 border-t text-center space-y-3"
            style={{ borderColor: "rgba(191,201,195,0.3)" }}
          >
            <p className="text-sm" style={{ color: "#404944" }}>
              Authorized access only. By signing in, you agree to our{" "}
              <a
                href="#"
                className="font-medium hover:underline"
                style={{ color: "#006b5f" }}
              >
                Terms of Service
              </a>
              .
            </p>
            <div className="flex justify-center gap-6">
              <button
                className="flex items-center gap-1 text-xs font-medium transition-colors hover:text-brand-900"
                style={{ color: "#707974" }}
              >
                <LuCircleHelp className="text-sm" />
                Support
              </button>
              <button
                className="flex items-center gap-1 text-xs font-medium transition-colors hover:text-brand-900"
                style={{ color: "#707974" }}
              >
                <LuGlobe className="text-sm" />
                English (US)
              </button>
            </div>
          </div>
        </div>

        {/* Status badge */}
        <div className="mt-6 text-center">
          <span
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full border text-xs font-medium"
            style={{
              background: "rgba(255,255,255,0.10)",
              backdropFilter: "blur(8px)",
              borderColor: "rgba(255,255,255,0.20)",
              color: "rgba(255,255,255,0.80)",
            }}
          >
            <span
              className="w-2 h-2 rounded-full"
              style={{ background: "#6df5e1" }}
            />
            All Systems Operational
          </span>
        </div>
      </main>
    </div>
  );
}
