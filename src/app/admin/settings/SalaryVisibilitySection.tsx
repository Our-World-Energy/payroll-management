"use client";

import { useEffect, useState } from "react";
import { LuChevronDown, LuChevronUp, LuLock, LuLockOpen, LuPlus, LuX, LuShieldCheck, LuDatabase, LuLoader } from "react-icons/lu";
import { toast } from "sonner";
import { useSalaryAccess, fmtVerifiedUntil } from "@/components/SalaryAccessContext";
import {
  fetchSalaryViewers, addSalaryViewer, removeSalaryViewer,
  fetchSalaryEncryptionStatus, runSalaryEncryptionBackfill,
  type SalaryViewerList, type SalaryEncryptionStatus,
} from "../salary-access/actions";

const INPUT = "w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500 transition-all";

// Settings → Salary Visibility. Two parts:
//   • Who may unlock salary (the allowlist). Only someone who is themself
//     unlocked can change it — so the first viewer has to come from the
//     SALARY_VIEWER_EMAILS env var.
//   • Encryption status of the salary columns, with a one-click backfill for
//     rows still stored in plaintext (idempotent; safe to re-run).
export function SalaryVisibilitySection() {
  const { loading, eligible, verified, verifiedUntil, canView, email, openVerify, lock, setupError } = useSalaryAccess();
  const [open, setOpen] = useState(false);

  const [viewers, setViewers] = useState<SalaryViewerList | null>(null);
  const [newEmail, setNewEmail] = useState("");
  const [busy, setBusy] = useState(false);

  const [enc, setEnc] = useState<SalaryEncryptionStatus | null>(null);
  const [encBusy, setEncBusy] = useState(false);

  async function reload() {
    const [v, e] = await Promise.all([fetchSalaryViewers().catch(() => null), fetchSalaryEncryptionStatus().catch(() => null)]);
    setViewers(v);
    setEnc(e);
  }
  useEffect(() => { if (open) reload(); }, [open, canView]);

  async function handleAdd() {
    const value = newEmail.trim();
    if (!value) return;
    setBusy(true);
    const res = await addSalaryViewer(value);
    setBusy(false);
    if (!res.ok) { toast.error(res.error ?? "Could not add."); return; }
    setNewEmail("");
    toast.success(`${value.toLowerCase()} can now unlock salary data`);
    reload();
  }

  async function handleRemove(target: string) {
    setBusy(true);
    const res = await removeSalaryViewer(target);
    setBusy(false);
    if (!res.ok) { toast.error(res.error ?? "Could not remove."); return; }
    toast.success(`${target} removed — their current unlock is revoked too`);
    reload();
  }

  async function handleBackfill() {
    setEncBusy(true);
    const res = await runSalaryEncryptionBackfill();
    setEncBusy(false);
    if (!res.ok) { toast.error(res.error ?? "Encryption failed."); reload(); return; }
    const total = Object.values(res.updated).reduce((a, b) => a + b, 0);
    toast.success(total ? `Encrypted ${total} row${total === 1 ? "" : "s"}` : "Everything was already encrypted");
    reload();
  }

  const pendingTotal = enc?.tables.reduce((a, t) => a + t.pending, 0) ?? 0;

  // Only admins on the salary allowlist see this section at all — for everyone
  // else salary simply doesn't exist in Settings. (The server actions behind it
  // refuse non-listed callers too; this just keeps the UI quiet.)
  if (loading || !eligible) return null;

  return (
    <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <button onClick={() => setOpen((v) => !v)} className="w-full px-6 py-4 border-b border-slate-100 flex items-center gap-2 text-left">
        {open ? <LuChevronUp size={15} className="text-slate-400 shrink-0" /> : <LuChevronDown size={15} className="text-slate-400 shrink-0" />}
        <h4 className="text-base font-semibold text-[#003527]">Salary Visibility</h4>
        <span className={`ml-auto inline-flex items-center gap-1.5 text-xs font-semibold px-2 py-1 rounded-full ${
          canView ? "text-emerald-700 bg-emerald-50" : "text-amber-800 bg-amber-50"
        }`}>
          {canView ? <LuLockOpen size={12} /> : <LuLock size={12} />}
          {canView ? `Unlocked until ${fmtVerifiedUntil(verifiedUntil)}` : "Locked — verify to unlock"}
        </span>
      </button>

      {open && (
        <div className="px-6 py-5 space-y-6">
          {/* Your own status */}
          <div className="flex items-start justify-between gap-4 pb-5 border-b border-slate-100">
            <div>
              <h5 className="text-sm font-semibold text-[#003527]">Your access</h5>
              <p className="text-xs text-slate-400 mt-0.5 max-w-lg">
                Salary and payment figures are stored encrypted and only shown to permitted admins who have verified
                their identity by email code within the last 30 days. Signed in as <span className="font-medium text-slate-600">{email ?? "—"}</span>.
              </p>
              {setupError && <p className="mt-1 text-xs text-red-600">Access tables unavailable: {setupError} — has the salary migration been run?</p>}
            </div>
            {!verified && (
              <button onClick={openVerify} className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 bg-[#003527] text-white text-xs font-semibold rounded-lg hover:bg-[#064E3B] transition-colors">
                <LuShieldCheck size={14} strokeWidth={2} /> Verify identity
              </button>
            )}
            {verified && (
              <button onClick={lock} title="Hide salary figures again — you'll need a new code to unlock"
                className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors">
                <LuLock size={14} strokeWidth={2} /> Lock now
              </button>
            )}
          </div>

          {/* Allowlist */}
          <div className="pb-5 border-b border-slate-100">
            <h5 className="text-sm font-semibold text-[#003527]">Who can view salary data</h5>
            <p className="text-xs text-slate-400 mt-0.5 mb-3 max-w-lg">
              Only these admins get the verification popup; everyone else sees masked figures. Adding someone lets
              them verify; removing them also ends any unlock they currently hold.
              {viewers && !viewers.canManage && " You need to be unlocked yourself to change this list."}
            </p>

            {viewers === null ? (
              <p className="text-xs text-slate-400 inline-flex items-center gap-1.5"><LuLoader size={12} className="animate-spin" /> Loading…</p>
            ) : (
              <>
                <div className="flex flex-wrap gap-2 mb-3">
                  {viewers.env.length + viewers.db.length === 0 && (
                    <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                      Nobody is permitted yet. Set <code className="font-mono">SALARY_VIEWER_EMAILS</code> in the server environment to bootstrap the first viewer.
                    </p>
                  )}
                  {viewers.env.map((e) => (
                    <span key={`env-${e}`} title="From SALARY_VIEWER_EMAILS — change it in the server environment" className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-700">
                      {e}
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">env</span>
                    </span>
                  ))}
                  {viewers.db.map((e) => (
                    <span key={e} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 border border-emerald-100 rounded-lg text-sm text-slate-700">
                      {e}
                      {viewers.canManage && (
                        <button onClick={() => handleRemove(e)} disabled={busy} className="text-slate-300 hover:text-red-500 transition-colors ml-0.5 disabled:opacity-40" title="Remove">
                          <LuX size={13} strokeWidth={2.5} />
                        </button>
                      )}
                    </span>
                  ))}
                </div>
                {viewers.canManage && (
                  <div className="flex gap-2 max-w-md">
                    <input
                      type="email"
                      className={INPUT}
                      placeholder="name@ourworldenergy.com"
                      value={newEmail}
                      onChange={(e) => setNewEmail(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleAdd(); } }}
                    />
                    <button onClick={handleAdd} disabled={busy || !newEmail.trim()} className="shrink-0 inline-flex items-center gap-1.5 px-4 py-2 bg-[#003527] text-white text-sm font-semibold rounded-lg hover:bg-[#064E3B] transition-colors disabled:opacity-50">
                      <LuPlus size={15} strokeWidth={2.5} /> Add
                    </button>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Encryption status */}
          <div>
            <div className="flex items-start justify-between gap-4">
              <div>
                <h5 className="text-sm font-semibold text-[#003527] inline-flex items-center gap-1.5"><LuDatabase size={14} /> Encryption at rest</h5>
                <p className="text-xs text-slate-400 mt-0.5 max-w-lg">
                  New salary values are always written encrypted. Rows created before this feature are still plain
                  until encrypted here — safe to run any time, and rows already encrypted are skipped.
                </p>
              </div>
              {canView && (
                <button onClick={handleBackfill} disabled={encBusy || !enc?.keyConfigured || pendingTotal === 0}
                  className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 bg-[#003527] text-white text-xs font-semibold rounded-lg hover:bg-[#064E3B] transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                  {encBusy ? <LuLoader size={14} className="animate-spin" /> : <LuLock size={14} strokeWidth={2} />}
                  {encBusy ? "Encrypting…" : pendingTotal === 0 ? "All encrypted" : `Encrypt ${pendingTotal} pending row${pendingTotal === 1 ? "" : "s"}`}
                </button>
              )}
            </div>
            {enc === null ? (
              <p className="mt-3 text-xs text-slate-400 inline-flex items-center gap-1.5"><LuLoader size={12} className="animate-spin" /> Checking…</p>
            ) : (
              <div className="mt-3 space-y-1.5">
                {!enc.keyConfigured && (
                  <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                    <code className="font-mono">SALARY_MASTER_KEY</code> is not set on the server — salary values cannot be read or written until it is.
                  </p>
                )}
                {enc.tables.map((t) => (
                  <div key={t.table} className="flex items-center justify-between text-xs px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg">
                    <span className="font-mono text-slate-600">{t.table}</span>
                    {t.error ? (
                      <span className="text-red-600">{t.error}</span>
                    ) : (
                      <span className={t.pending === 0 ? "text-emerald-700 font-semibold" : "text-amber-700 font-semibold"}>
                        {t.pending === 0 ? `${t.total} rows encrypted` : `${t.pending} of ${t.total} rows still plain`}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
