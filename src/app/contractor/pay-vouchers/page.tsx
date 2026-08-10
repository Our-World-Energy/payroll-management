"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  fetchContractorVouchers,
  type ContractorVoucher, type ContractorVoucherProfile,
} from "./actions";
import {
  computePayComponents, DAY_LABELS, REST_DAY_TO_LABEL, fmtVoucherDate,
} from "@/lib/payrollVoucher";
import { datesBetween, addDaysIso } from "@/lib/weekUtils";
import { PageHeader } from "../_components/portal";
import { Logo } from "@/components/Logo";
import {
  LuLoader, LuBadgeCheck, LuCalendarDays, LuCalendarCheck,
  LuInfo, LuCircleMinus, LuDownload, LuWallet, LuChevronDown,
} from "react-icons/lu";

// ── formatting helpers ────────────────────────────────────────────────────
const money = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function fmtRange(from: string, to: string) {
  const d = (iso: string, withYear: boolean) => {
    const [y, m, dd] = iso.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, dd)).toLocaleDateString("en-US", {
      timeZone: "UTC", month: "short", day: "2-digit", ...(withYear ? { year: "numeric" } : {}),
    });
  };
  return `${d(from, false)} - ${d(to, true)}`;
}
function fmtDate(iso: string) {
  const [y, m, dd] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, dd)).toLocaleDateString("en-US", { timeZone: "UTC", month: "short", day: "2-digit", year: "numeric" });
}

// Voucher figures. Gross / total deductions / net are authoritative straight
// from the processed payroll run (v.gross / v.deductions / v.net). The per-
// component hours & pay lines are derived from the attendance split (shared
// computePayComponents) to explain how that gross was reached.
function voucherTotals(v: ContractorVoucher) {
  const c = computePayComponents(v.hourlyRate, v.totals);
  const ptoPay = v.ptoHours * v.hourlyRate;
  return { ...c, ptoPay, grossPay: v.gross, totalDeductions: v.deductions, netPay: v.net };
}

export default function ContractorPayVouchersPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [profile, setProfile] = useState<ContractorVoucherProfile | null>(null);
  const [vouchers, setVouchers] = useState<ContractorVoucher[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [printRequested, setPrintRequested] = useState(false);
  const [printWeek, setPrintWeek] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    const supabase = createClient();
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user?.email) { router.replace("/login"); return; }
      const result = await fetchContractorVouchers(session.user.email);
      if (!result) { setError("Profile not found."); setLoading(false); return; }
      setProfile(result.profile);
      setVouchers(result.vouchers);
      setSelected(result.vouchers[0]?.weekStart ?? "");
      setLoading(false);
    })();
  }, [router]);

  // Print once the requested voucher has been selected & rendered into the
  // print-only layout. `printing-voucher` on <body> scopes the print CSS to
  // this action so it never affects a normal Ctrl+P elsewhere.
  useEffect(() => {
    if (!printRequested) return;
    setPrintRequested(false);
    const body = document.body;
    body.classList.add("printing-voucher");
    const done = () => body.classList.remove("printing-voucher");
    window.addEventListener("afterprint", done, { once: true });
    window.print();
  }, [printRequested]);

  // Download the given week's voucher as a one-page PDF — from the main card or
  // any Payment History row — without disturbing the on-screen selection.
  function handleDownload(weekStart: string) {
    setPrintWeek(weekStart);
    setPrintRequested(true);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <LuLoader size={28} className="text-slate-300 animate-spin" />
      </div>
    );
  }
  if (error || !profile) {
    return <div className="flex items-center justify-center min-h-[60vh] text-slate-400 text-sm">{error || "Unable to load vouchers."}</div>;
  }

  const main = vouchers.find((v) => v.weekStart === selected) ?? vouchers[0] ?? null;
  // The voucher fed into the print-only layout — the week whose Download PDF was
  // clicked (main card or a history row), falling back to the on-screen one.
  const printVoucher = vouchers.find((v) => v.weekStart === printWeek) ?? main;

  return (
    <div className="space-y-8 max-w-6xl mx-auto">
      <PageHeader title="Pay Vouchers" subtitle="Your weekly earnings statements and payment history." />

      {!main ? (
        <div className="bg-white border border-slate-200/80 rounded-2xl p-12 text-center shadow-sm">
          <LuWallet size={32} className="mx-auto text-slate-300 mb-3" strokeWidth={1.5} />
          <p className="text-sm text-slate-500 font-medium">No pay vouchers yet.</p>
          <p className="text-xs text-slate-400 mt-1">Vouchers appear here once a pay cycle has been reviewed and finalised.</p>
        </div>
      ) : (
        <Voucher profile={profile} v={main} onDownload={handleDownload} />
      )}

      {vouchers.length > 0 && (
        <PaymentHistory
          vouchers={vouchers}
          selected={selected}
          onSelect={setSelected}
          onDownload={handleDownload}
          open={historyOpen}
          onToggle={() => setHistoryOpen((o) => !o)}
        />
      )}

      {/* Print-only voucher (admin payroll-voucher design) — the Download PDF theme.
          Portalled to <body> so print CSS can drop the rest of the app and keep
          the voucher to a single page. */}
      {mounted && printVoucher && createPortal(
        <div className="pv-print hidden">
          <PrintableVoucher profile={profile} v={printVoucher} />
        </div>,
        document.body,
      )}
    </div>
  );
}

// ── The main voucher (mirrors the reference design) ─────────────────────────
function Voucher({ profile, v, onDownload }: { profile: ContractorVoucherProfile; v: ContractorVoucher; onDownload: (weekStart: string) => void }) {
  const t = voucherTotals(v);
  const restDayLabels = new Set(
    profile.restDay.split(",").map((d) => REST_DAY_TO_LABEL[d.trim()]).filter(Boolean)
  );
  const weekDates = datesBetween(v.rangeFrom, v.rangeTo);

  const overtimePay = t.regOtPay + t.rdOtPay + t.hoOtPay;
  const holidayPay = t.usHolidayPay + t.localHolidayPay;
  const otHours = t.regOtHours + t.rdOtHours + t.hoOtHours;
  const { bonus, misc, retroPay, reim, cashAdvance, hmo } = v.adjustment;

  return (
    <div className="space-y-8">
      {/* Employee summary + rates */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-6 items-end">
        <div className="space-y-1">
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-[0.18em]">Employee Summary</p>
          <h2 className="text-3xl md:text-4xl font-bold text-[#003527] tracking-tight" style={{ letterSpacing: "-0.02em" }}>{profile.name}</h2>
          <div className="flex items-center gap-2 text-slate-600 pt-1">
            <LuBadgeCheck size={17} className="text-emerald-700 shrink-0" strokeWidth={2} />
            <span className="text-sm">{profile.role} · ID #{profile.contractorId.replace(/^#/, "")}</span>
          </div>
          <div className="flex items-center gap-2 text-slate-600">
            <LuCalendarDays size={17} className="text-emerald-700 shrink-0" strokeWidth={2} />
            <span className="text-sm">Pay Cycle: {fmtRange(v.rangeFrom, v.rangeTo)}</span>
          </div>
          <div className="flex items-center gap-2 text-slate-600">
            <LuCalendarCheck size={17} className="text-emerald-700 shrink-0" strokeWidth={2} />
            <span className="text-sm">Check Date: {fmtDate(v.checkDate)}</span>
          </div>
        </div>
        <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm flex justify-between md:justify-end md:gap-12">
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Monthly Contract Rate</p>
            <p className="text-2xl font-bold text-[#003527] mt-1 tabular-nums">{money(v.monthlyRate)} <span className="text-sm font-medium text-slate-400">{v.currency}</span></p>
          </div>
          <div className="text-right">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Weekly Contract Rate</p>
            <p className="text-2xl font-bold text-slate-700 mt-1 tabular-nums">{money(v.weeklyRate)} <span className="text-sm font-medium text-slate-400">{v.currency}</span></p>
          </div>
        </div>
      </section>

      {/* Gross Pay Breakdown */}
      <div className="rounded-2xl overflow-hidden border border-slate-200/80 bg-white shadow-sm">
        <div className="bg-brand-900 px-6 py-3 flex justify-between items-center">
          <h3 className="text-white font-bold text-xs uppercase tracking-[0.18em]">Gross Pay Breakdown</h3>
          <LuInfo size={18} className="text-emerald-200/80" strokeWidth={2} />
        </div>
        <div className="p-6 lg:p-8 grid grid-cols-1 lg:grid-cols-2 gap-10">
          {/* Left — hours */}
          <div className="space-y-8">
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase mb-3 tracking-wider">Weekly Attendance</p>
              <div className="grid grid-cols-7 border border-slate-100 rounded-lg overflow-hidden">
                {weekDates.map((date, i) => {
                  const label = DAY_LABELS[i];
                  const isOff = restDayLabels.has(label);
                  const hours = (v.evaluatedDailyMinutes[date] ?? 0) / 60;
                  return (
                    <div key={date} className={`p-2 text-center border-b border-r border-slate-100 last:border-r-0 ${isOff ? "bg-slate-50" : "bg-white"}`}>
                      <p className="text-[10px] font-bold text-slate-400">{label}</p>
                      <p className={`text-xs font-bold tabular-nums mt-0.5 ${isOff ? "text-slate-400" : "text-emerald-900"}`}>{isOff ? "OFF" : hours.toFixed(2)}</p>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="space-y-1">
              {[
                ["REG Hours", t.regHours, true],
                ["PTO HRS", v.ptoHours, false],
                ["US HO HRS", t.usHolidayHours, false],
                ["LOCAL HO HRS", t.localHolidayHours, false],
                ["REG OT / RD OT / HO OT", otHours, false],
              ].map(([label, value, strong]) => (
                <div key={label as string} className="flex justify-between items-center py-2 border-b border-slate-50 last:border-0">
                  <span className={`text-sm ${strong ? "font-medium text-slate-600" : "text-slate-500"}`}>{label}</span>
                  <span className={`font-bold tabular-nums ${(value as number) > 0 ? "text-emerald-900" : "text-slate-300"}`}>{(value as number).toFixed(2)}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Right — earnings */}
          <div className="space-y-6">
            <div className="space-y-3">
              <p className="text-[10px] font-bold text-slate-400 uppercase mb-3 tracking-wider">Earnings Breakdown</p>
              <div className="flex justify-between items-center">
                <span className="text-sm text-slate-600">Regular Hours Pay</span>
                <span className="text-2xl font-bold text-emerald-900 tabular-nums">{money(t.regPay)}</span>
              </div>
              <div className="space-y-1.5 pt-1">
                {[
                  ["Overtime (REG/RD/HO)", overtimePay],
                  ["Holiday Pay (US/Local)", holidayPay],
                  ["Paid Time Off (PTO)", t.ptoPay],
                  ["Bonus & Miscellaneous", bonus + misc],
                  ["Retroactive Pay & REIM", retroPay + reim],
                ].map(([label, value]) => (
                  <div key={label as string} className="flex justify-between text-sm">
                    <span className={(value as number) > 0 ? "text-slate-600" : "text-slate-400"}>{label}</span>
                    <span className={`tabular-nums ${(value as number) > 0 ? "font-semibold text-slate-700" : "text-slate-400"}`}>{money(value as number)}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="pt-6 border-t-2 border-dashed border-slate-100">
              <div className="bg-emerald-50 border-2 border-emerald-700/20 rounded-xl p-5 flex justify-between items-center">
                <div>
                  <p className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider">Gross Pay Total</p>
                  <p className="text-[10px] text-emerald-600">Before deductions</p>
                </div>
                <div className="text-right">
                  <span className="text-3xl font-bold text-emerald-900 tabular-nums">{money(t.grossPay)}</span>
                  <span className="text-sm font-medium text-emerald-700 ml-1">{v.currency}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Deductions */}
      <div className="rounded-2xl overflow-hidden border border-slate-200/80 bg-white shadow-sm">
        <div className="bg-brand-900 px-6 py-3 flex justify-between items-center">
          <h3 className="text-white font-bold text-xs uppercase tracking-[0.18em]">Deductions</h3>
          <LuCircleMinus size={18} className="text-emerald-200/80" strokeWidth={2} />
        </div>
        <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-10 items-center">
          <div className="space-y-4">
            {[
              ["Cash Advance", cashAdvance, <LuWallet key="w" size={18} className="text-slate-400" strokeWidth={1.75} />],
              ["HMO Premium", hmo, <LuBadgeCheck key="h" size={18} className="text-slate-400" strokeWidth={1.75} />],
            ].map(([label, value, icon]) => (
              <div key={label as string} className="flex justify-between items-center pb-3 border-b border-slate-100 last:border-0 last:pb-0">
                <div className="flex items-center gap-3">{icon as React.ReactNode}<span className="text-sm text-slate-600">{label as string}</span></div>
                <span className={`font-bold tabular-nums ${(value as number) > 0 ? "text-slate-700" : "text-slate-300"}`}>{money(value as number)}</span>
              </div>
            ))}
          </div>
          <div className="md:border-l border-slate-100 md:pl-10">
            <div className="flex justify-between items-center">
              <div>
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Total Deductions</p>
                <p className="text-[10px] text-slate-400">Current pay cycle</p>
              </div>
              <div className="bg-slate-50 border border-slate-200 rounded-lg px-6 py-3">
                <span className="text-2xl font-bold text-slate-700 tabular-nums">{money(t.totalDeductions)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Net Pay */}
      <div className="bg-brand-900 text-white rounded-2xl shadow-lg p-8 flex flex-col md:flex-row justify-between items-center gap-6">
        <div className="flex items-center gap-4">
          <div className="bg-white/10 p-3 rounded-full"><LuWallet size={28} strokeWidth={2} /></div>
          <div>
            <h2 className="text-2xl font-bold">Final Settlement</h2>
            <p className="text-emerald-100/80 text-sm">Voucher for period: {fmtRange(v.rangeFrom, v.rangeTo)}</p>
          </div>
        </div>
        <div className="flex flex-col items-center md:items-end">
          <p className="text-[10px] font-bold text-emerald-100/80 uppercase tracking-[0.18em] mb-1">Total Net Pay</p>
          <div className="flex items-baseline gap-2">
            <span className="text-xl font-medium text-emerald-100/90">{v.currency}</span>
            <span className="text-4xl md:text-5xl font-bold tabular-nums">{money(t.netPay)}</span>
          </div>
        </div>
        <button
          onClick={() => onDownload(v.weekStart)}
          className="bg-secondary-container text-on-secondary-container px-7 py-3 rounded-full font-bold text-sm uppercase tracking-wider hover:opacity-90 transition-opacity flex items-center gap-2"
        >
          <LuDownload size={17} strokeWidth={2} /> Download PDF
        </button>
      </div>
    </div>
  );
}

// ── Payment history (collapsible) ───────────────────────────────────────────
function PaymentHistory({
  vouchers, selected, onSelect, onDownload, open, onToggle,
}: {
  vouchers: ContractorVoucher[];
  selected: string;
  onSelect: (weekStart: string) => void;
  onDownload: (weekStart: string) => void;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="rounded-2xl overflow-hidden border border-slate-200/80 bg-white shadow-sm">
      <button onClick={onToggle} className="w-full bg-brand-900 px-6 py-3 flex justify-between items-center cursor-pointer">
        <h3 className="text-white font-bold text-xs uppercase tracking-[0.18em]">Payment History</h3>
        <LuChevronDown size={18} className={`text-emerald-200/80 transition-transform ${open ? "rotate-180" : ""}`} strokeWidth={2} />
      </button>
      {open && (
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                {["Pay Cycle", "Check Date", "Net Pay", "Status", ""].map((h, i) => (
                  <th key={h || i} className={`px-6 py-4 text-[10px] font-bold uppercase tracking-wider text-slate-400 ${i === 4 ? "text-right" : ""}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {vouchers.map((v) => {
                const { netPay } = voucherTotals(v);
                const isActive = v.weekStart === selected;
                return (
                  <tr
                    key={v.weekStart}
                    onClick={() => onSelect(v.weekStart)}
                    className={`transition-colors cursor-pointer ${isActive ? "bg-emerald-50/60" : "hover:bg-slate-50/60"}`}
                  >
                    <td className="px-6 py-4 text-sm text-slate-600 whitespace-nowrap">{fmtRange(v.rangeFrom, v.rangeTo)}</td>
                    <td className="px-6 py-4 text-sm text-slate-600 whitespace-nowrap">{fmtDate(v.checkDate)}</td>
                    <td className="px-6 py-4 text-sm font-semibold text-emerald-900 whitespace-nowrap tabular-nums">{money(netPay)} {v.currency}</td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${v.status === "Paid" ? "bg-emerald-100 text-emerald-900" : "bg-amber-100 text-amber-800"}`}>{v.status}</span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={(e) => { e.stopPropagation(); onDownload(v.weekStart); }}
                        title="Download voucher"
                        className="text-emerald-700 hover:text-emerald-900 transition-colors"
                      >
                        <LuDownload size={17} strokeWidth={2} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Print-only voucher — replicates the admin Payroll Voucher layout, used as
// the Download PDF theme (hidden on screen, shown only when printing). ───────
function PrintableVoucher({ profile, v }: { profile: ContractorVoucherProfile; v: ContractorVoucher }) {
  const weekDates = datesBetween(v.rangeFrom, v.rangeTo);
  const restDayLabels = new Set(
    profile.restDay.split(",").map((d) => REST_DAY_TO_LABEL[d.trim()]).filter(Boolean)
  );

  // Identical math to the admin Payroll Voucher: each component from its own
  // time total, plus PTO pay and the manual earnings; deductions include tax.
  const ptoHours = v.ptoHours;
  const {
    regHours, regOtHours, rdOtHours, usHolidayHours, hoOtHours, localHolidayHours,
    regPay, regOtPay, rdOtPay, usHolidayPay, hoOtPay, localHolidayPay,
    grossPay: componentGrossPay,
  } = computePayComponents(v.hourlyRate, v.totals);
  const ptoPay = ptoHours * v.hourlyRate;
  const { bonus, misc, retroPay, reim, cashAdvance, hmo, tax } = v.adjustment;
  const grossPay = componentGrossPay + ptoPay + bonus + misc + retroPay + reim;
  const totalDeductions = cashAdvance + hmo + tax;
  const netPay = grossPay - totalDeductions;

  return (
    <div className="p-6 md:p-8 text-sm text-slate-800 bg-white">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 pb-4 border-b-2 border-[#003527]">
        <div className="flex items-start gap-3">
          <Logo className="h-10 w-10 shrink-0" />
          <div>
            <p className="font-bold text-slate-800">Our World Energy</p>
            <p className="text-xs text-slate-500">2501 W Phelps Rd, Phoenix, AZ 85023</p>
            <p className="text-xs text-teal-600">offshorepayroll@ourworldenergy.com</p>
          </div>
        </div>
        <div className="text-right text-xs">
          <p><span className="text-slate-500">Pay Cycle:</span> <span className="font-semibold">{fmtVoucherDate(v.rangeFrom)} to {fmtVoucherDate(v.rangeTo)}</span></p>
          <p className="mt-1"><span className="text-slate-500">Check Date:</span> <span className="font-semibold">{fmtVoucherDate(v.checkDate)}</span></p>
        </div>
      </div>

      <h3 className="text-center font-bold text-slate-700 tracking-wide mt-3 mb-4">Payroll Voucher</h3>

      {/* Contractor info */}
      <div className="grid grid-cols-2 gap-x-8 gap-y-1.5 text-xs mb-5">
        <p><span className="text-slate-500">Contractor</span> <span className="font-semibold ml-2">{profile.name}</span></p>
        <p><span className="text-slate-500">Monthly Contract Rate</span> <span className="font-semibold ml-2">{money(v.monthlyRate)}</span></p>
        <p><span className="text-slate-500">Role</span> <span className="font-semibold ml-2">{profile.role}</span></p>
        <p><span className="text-slate-500">Weekly Contract Rate</span> <span className="font-semibold ml-2">{money(v.weeklyRate)}</span></p>
      </div>

      {/* Gross Pay */}
      <div className="bg-[#003527] text-white text-xs font-bold uppercase tracking-wider px-3 py-1.5 rounded-t-md">Gross Pay</div>
      <div className="border border-t-0 border-slate-200 rounded-b-md px-4 py-4 grid grid-cols-2 gap-6">
        <div>
          <table className="w-full text-xs mb-4">
            <thead>
              <tr>{DAY_LABELS.map((d) => (
                <th key={d} className="border border-slate-200 bg-slate-50 px-1 py-1 font-semibold text-slate-500">{d}</th>
              ))}</tr>
            </thead>
            <tbody>
              <tr>{weekDates.map((date, i) => {
                const label = DAY_LABELS[i];
                const isOff = restDayLabels.has(label);
                const hours = (v.evaluatedDailyMinutes[date] ?? 0) / 60;
                return (
                  <td key={date} className="border border-slate-200 px-1 py-1.5 text-center tabular-nums">
                    {isOff ? "OFF" : hours.toFixed(2)}
                  </td>
                );
              })}</tr>
            </tbody>
          </table>
          <div className="space-y-2 text-xs">
            {[
              ["REG Hours", regHours],
              ["PTO HRS", ptoHours],
              ["US HO HRS", usHolidayHours],
              ["LOCAL HO HRS", localHolidayHours],
            ].map(([label, value]) => (
              <div key={label as string} className="flex items-center justify-between border-b border-dotted border-slate-300 pb-1">
                <span className="text-slate-500">{label}</span>
                <span className="font-semibold tabular-nums">{(value as number).toFixed(2)}</span>
              </div>
            ))}
            {[
              ["REG OT HRS", regOtHours],
              ["RD OT HRS", rdOtHours],
              ["HO OT HRS", hoOtHours],
            ].map(([label, value]) => (
              <div key={label as string} className="flex items-center justify-between border-b border-dotted border-slate-300 pb-1">
                <span className="text-slate-500">{label}</span>
                <span className="font-semibold tabular-nums">{(value as number).toFixed(2)}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-2 text-xs">
          {[
            ["REG HRS Pay", regPay],
            ["REG OT", regOtPay],
            ["RD OT", rdOtPay],
            ["US HOLIDAY PAY", usHolidayPay],
            ["HO OT", hoOtPay],
            ["LOCAL HOLIDAY PAY", localHolidayPay],
            ["PTO", ptoPay],
            ["Bonus", bonus],
            ["MISC", misc],
            ["Retro Pay", retroPay],
            ["REIM", reim],
          ].map(([label, value]) => (
            <div key={label as string} className="flex items-center justify-between border-b border-dotted border-slate-300 pb-1">
              <span className="text-slate-500">{label}</span>
              <span className={`tabular-nums ${(value as number) > 0 ? "font-semibold" : "text-slate-300"}`}>{money(value as number)}</span>
            </div>
          ))}
          <div className="flex items-center justify-between border-2 border-[#003527] rounded-md px-2 py-1.5 mt-3">
            <span className="font-bold uppercase text-[10px] tracking-wider text-slate-500">Gross Pay</span>
            <span className="font-bold tabular-nums">{money(grossPay)}</span>
          </div>
        </div>
      </div>

      {/* Deductions */}
      <div className="bg-[#003527] text-white text-xs font-bold uppercase tracking-wider px-3 py-1.5 rounded-t-md mt-5">Deduction</div>
      <div className="border border-t-0 border-slate-200 rounded-b-md px-4 py-4 flex items-end justify-between gap-6">
        <div className="space-y-2 text-xs flex-1">
          {[
            ["Cash Advance", cashAdvance],
            ["HMO Premium", hmo],
          ].map(([label, value]) => (
            <div key={label as string} className="flex items-center justify-between border-b border-dotted border-slate-300 pb-1">
              <span className="text-slate-500">{label}</span>
              <span className={`tabular-nums ${(value as number) > 0 ? "font-semibold" : "text-slate-300"}`}>{money(value as number)}</span>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <span className="font-bold uppercase text-[10px] tracking-wider text-slate-500 whitespace-nowrap">Total Deductions</span>
          <span className="font-bold tabular-nums border-2 border-slate-300 rounded-md px-3 py-1.5">{money(totalDeductions)}</span>
        </div>
      </div>

      {/* Net Pay */}
      <div className="mt-5 flex items-center justify-between bg-[#003527] text-white rounded-md px-4 py-3">
        <span className="font-bold uppercase text-xs tracking-wider">Net Pay</span>
        <span className="font-bold text-lg tabular-nums">{v.currency} {money(netPay)}</span>
      </div>

      <p className="text-[10px] text-slate-400 mt-3">
        Check Date is always the Friday following the pay cycle&apos;s end date.
        Bonus, MISC, Retro Pay, REIM, Cash Advance, HMO Premium, and Tax can be entered via the Review action on the payroll table.
      </p>
    </div>
  );
}
