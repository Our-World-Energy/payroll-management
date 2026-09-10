"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { LuLock, LuMailCheck, LuKeyRound, LuLoaderCircle, LuShieldCheck, LuX } from "react-icons/lu";
import {
  getSalaryAccessStatus, requestSalaryOtp, verifySalaryOtp, lockSalaryAccess,
  type SalaryAccessStatus,
} from "@/app/admin/salary-access/actions";

// Client-side view of the salary unlock (the real gate is server-side — see
// src/lib/salaryAccess.ts). Pages read `canView` to decide whether to render
// money or the mask; the provider also owns the "verify your identity" popup
// that appears for allowlisted admins who aren't unlocked yet.

/** What every money cell shows while salary is locked. */
export const SALARY_MASK = "••••••";

type SalaryAccessState = SalaryAccessStatus & {
  loading: boolean;
  /** Re-fetch the status from the server. */
  refresh: () => Promise<void>;
  /** Open the OTP popup (only does anything for an eligible admin). */
  openVerify: () => void;
  /** Re-lock salary for this user. */
  lock: () => Promise<void>;
};

const INITIAL: SalaryAccessStatus = {
  signedIn: false, email: null, isAdmin: false, eligible: false, verified: false,
  verifiedUntil: null, canView: false, mailConfigured: false,
};

const SalaryAccessContext = createContext<SalaryAccessState>({
  ...INITIAL, loading: true, refresh: async () => {}, openVerify: () => {}, lock: async () => {},
});

// The popup can be dismissed with "Later"; remember that for this tab only so
// it doesn't reappear on every navigation, but does on the next sign-in.
const DISMISS_KEY = "salary_verify_dismissed";

export function SalaryAccessProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<SalaryAccessStatus>(INITIAL);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const autoOpened = useRef(false);

  const refresh = useCallback(async () => {
    try {
      const next = await getSalaryAccessStatus();
      setStatus(next);
    } catch {
      setStatus(INITIAL);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  // First load: prompt an eligible-but-locked admin once per tab.
  useEffect(() => {
    if (loading || autoOpened.current) return;
    if (!status.eligible || status.verified) return;
    let dismissed = false;
    try { dismissed = sessionStorage.getItem(DISMISS_KEY) === "1"; } catch { /* ignore */ }
    autoOpened.current = true;
    if (!dismissed) setModalOpen(true);
  }, [loading, status.eligible, status.verified]);

  const openVerify = useCallback(() => {
    if (status.eligible) setModalOpen(true);
  }, [status.eligible]);

  const lock = useCallback(async () => {
    const res = await lockSalaryAccess();
    if (!res.ok) { toast.error(res.error ?? "Could not lock salary access."); return; }
    toast.success("Salary figures are hidden again.");
    await refresh();
  }, [refresh]);

  function dismiss() {
    try { sessionStorage.setItem(DISMISS_KEY, "1"); } catch { /* ignore */ }
    setModalOpen(false);
  }

  return (
    <SalaryAccessContext.Provider value={{ ...status, loading, refresh, openVerify, lock }}>
      {children}
      {modalOpen && (
        <SalaryVerifyModal
          email={status.email ?? ""}
          mailConfigured={status.mailConfigured}
          onClose={dismiss}
          onVerified={async () => { setModalOpen(false); await refresh(); }}
        />
      )}
    </SalaryAccessContext.Provider>
  );
}

export function useSalaryAccess() {
  return useContext(SalaryAccessContext);
}

/** "Sep 8, 2026" for the unlock-expiry badge. */
export function fmtVerifiedUntil(iso: string | null) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// ── The popup ─────────────────────────────────────────────────────────────────

type Step = "intro" | "code";

function SalaryVerifyModal({ email, mailConfigured, onClose, onVerified }: {
  email: string;
  mailConfigured: boolean;
  onClose: () => void;
  onVerified: () => Promise<void>;
}) {
  const [step, setStep] = useState<Step>("intro");
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [maskedEmail, setMaskedEmail] = useState("");
  const [expiresIn, setExpiresIn] = useState(10);
  const [devCode, setDevCode] = useState<string | null>(null);
  const [resendIn, setResendIn] = useState(0);

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  async function sendCode() {
    setSending(true);
    setError("");
    try {
      const res = await requestSalaryOtp();
      if (!res.ok) {
        setError(res.error);
        if (res.retryAfterSeconds) { setResendIn(res.retryAfterSeconds); setStep("code"); }
        return;
      }
      setMaskedEmail(res.maskedEmail);
      setExpiresIn(res.expiresInMinutes);
      setDevCode(res.devCode ?? null);
      setResendIn(60);
      setCode("");
      setStep("code");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send the code.");
    } finally {
      setSending(false);
    }
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setVerifying(true);
    setError("");
    try {
      const res = await verifySalaryOtp(code);
      if (!res.ok) { setError(res.error); setCode(""); return; }
      toast.success(`Salary unlocked until ${fmtVerifiedUntil(res.verifiedUntil)}`);
      await onVerified();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verification failed.");
    } finally {
      setVerifying(false);
    }
  }

  return (
    <div className="fixed inset-0 z-70 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-[430px] rounded-2xl bg-white shadow-2xl border border-slate-200 p-7 text-slate-800">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-3 top-3 grid size-8 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
        >
          <LuX size={16} />
        </button>

        <div className="text-center mb-5">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full" style={{ background: "#e6f4f1", color: "#006b5f" }}>
            {step === "intro" ? <LuLock size={22} /> : <LuMailCheck size={22} />}
          </div>
          <h2 className="text-lg font-bold" style={{ color: "#191c1e" }}>Verify to view salary data</h2>
          <p className="text-sm mt-1" style={{ color: "#707974" }}>
            {step === "intro"
              ? "Salary and payment figures are hidden until you confirm it's you. We'll email a 6-digit code to"
              : `Enter the 6-digit code we sent to ${maskedEmail || email}. It expires in ${expiresIn} minutes.`}
          </p>
          {step === "intro" && <p className="text-sm font-semibold mt-0.5" style={{ color: "#003527" }}>{email}</p>}
        </div>

        {step === "intro" && (
          <div className="space-y-3">
            {!mailConfigured && (
              <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                Email sending isn&apos;t configured on this server yet, so your code will be shown here instead of emailed.
              </p>
            )}
            {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-center">{error}</p>}
            <button
              type="button"
              onClick={sendCode}
              disabled={sending}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-lg text-base font-semibold text-white shadow-md transition-all active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed"
              style={{ background: "#064e3b" }}
            >
              {sending ? <LuLoaderCircle size={18} className="animate-spin" /> : <LuMailCheck size={18} />}
              {sending ? "Sending…" : "Send code"}
            </button>
            <button type="button" onClick={onClose} className="w-full py-2 text-sm font-medium hover:underline" style={{ color: "#707974" }}>
              Later — keep salary hidden
            </button>
          </div>
        )}

        {step === "code" && (
          <form className="space-y-4" onSubmit={verify}>
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
                style={{ borderColor: "#bfc9c3", color: "#191c1e" }}
              />
            </div>
            {devCode && (
              <p className="text-xs text-center text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                Your verification code is <span className="font-mono font-bold tracking-widest">{devCode}</span>
              </p>
            )}
            {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-center">{error}</p>}
            <button
              type="submit"
              disabled={verifying || code.length < 6}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-lg text-base font-semibold text-white shadow-md transition-all active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed"
              style={{ background: "#064e3b" }}
            >
              {verifying ? <LuLoaderCircle size={18} className="animate-spin" /> : <LuShieldCheck size={18} />}
              {verifying ? "Verifying…" : "Verify"}
            </button>
            <div className="flex items-center justify-between text-sm">
              <button
                type="button"
                onClick={sendCode}
                disabled={sending || resendIn > 0}
                className="font-medium hover:underline disabled:no-underline disabled:opacity-50"
                style={{ color: "#006b5f" }}
              >
                {resendIn > 0 ? `Resend in ${resendIn}s` : "Resend code"}
              </button>
              <button type="button" onClick={onClose} className="font-medium hover:underline" style={{ color: "#707974" }}>
                Later
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

// ── Inline banner for pages that show money ───────────────────────────────────
// Locked users get back into the popup from here (after "Later") or from
// Settings → Salary Visibility, which is also where re-locking lives.

export function SalaryLockedBanner({ dark, what = "Salary and payment figures" }: { dark: boolean; what?: string }) {
  const { loading, canView, eligible, keyMissing, openVerify } = useSalaryAccess();
  if (loading || canView) return null;
  // No key on this server (a developer's machine): a quiet note, not a prompt
  // — there's no verifying into it.
  if (keyMissing) {
    return (
      <div className={`mb-3 md:mb-4 flex items-center gap-3 rounded-xl border px-4 py-3 text-sm ${
        dark ? "bg-white/5 border-white/10 text-white/60" : "bg-slate-50 border-slate-200 text-slate-500"
      }`}>
        <LuLock size={16} strokeWidth={2} className="shrink-0" />
        <p><span className="font-semibold">{what} are not available in this environment.</span> Salary data is encrypted and this server has no decryption key configured.</p>
      </div>
    );
  }
  return (
    <div className={`mb-3 md:mb-4 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 rounded-xl border px-4 py-3 text-sm ${
      dark ? "bg-amber-400/10 border-amber-400/20 text-amber-200" : "bg-amber-50 border-amber-200 text-amber-900"
    }`}>
      <LuLock size={16} strokeWidth={2} className="shrink-0" />
      <p className="flex-1">
        <span className="font-semibold">{what} are hidden.</span>{" "}
        {eligible
          ? "Verify your identity with the code we email you to view them for 30 days."
          : "Your account isn't permitted to view salary data. Ask the payroll owner if you need access."}
      </p>
      {eligible && (
        <button
          type="button"
          onClick={openVerify}
          className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-[#003527] hover:bg-[#064E3B] transition-colors"
        >
          <LuShieldCheck size={14} strokeWidth={2} /> Verify identity
        </button>
      )}
    </div>
  );
}
