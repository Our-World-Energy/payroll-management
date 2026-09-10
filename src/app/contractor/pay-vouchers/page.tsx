"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  fetchContractorVouchers,
  type ContractorVoucher, type ContractorVoucherProfile,
} from "./actions";
import { DAY_LABELS, REST_DAY_TO_LABEL, fmtVoucherDate } from "@/lib/payrollVoucher";
import { datesBetween, weekLabel } from "@/lib/weekUtils";
import { PageHeader } from "../_components/portal";
import { Logo } from "@/components/Logo";
import {
  LuLoader, LuInfo, LuDownload, LuWallet, LuChevronDown,
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

// Every figure here is read straight off the frozen process_weekly_payroll
// row (v) — nothing is recomputed, so this always matches exactly what was
// finalized when the voucher was Processed.
function voucherTotals(v: ContractorVoucher) {
  return {
    regHours: v.regHours, regOtHours: v.regOtHours, rdOtHours: v.rdOtHours,
    usHolidayHours: v.usHolidayHours, hoOtHours: v.hoOtHours, localHolidayHours: v.localHolidayHours,
    regPay: v.regPay, regOtPay: v.regOtPay, rdOtPay: v.rdOtPay,
    usHolidayPay: v.usHolidayPay, hoOtPay: v.hoOtPay, localHolidayPay: v.localHolidayPay,
    ptoPay: v.ptoPay,
    // Part of v.gross, so they have to appear in the earnings lines or the
    // voucher shows a Gross its own lines don't reach.
    sickPay: v.sickPay, specialPay: v.specialPay, advancePay: v.advancePay,
    timeOffPay: v.ptoPay + v.sickPay + v.specialPay + v.advancePay,
    grossPay: v.gross, totalDeductions: v.deductions, netPay: v.net,
  };
}

/**
 * Rates are shown unrounded, unlike money totals. A rate is multiplied by every
 * hour worked, so presenting it rounded hides the precision the figures were
 * actually calculated from — see calcWeekly/calcHourly in AddContractorModal.
 * 20 is the most Intl allows and exceeds what a double carries, so every
 * available digit is shown.
 */
function fmtRate(n: number) {
  return n.toLocaleString(undefined, { maximumFractionDigits: 20 });
}

/**
 * Weekly Contract Rate, shown to 2 decimals. Display only — v.weeklyRate is
 * still the unrounded monthlyRate x 12 / 52, and every pay figure on the
 * voucher continues to derive from the unrounded hourly rate, not from this.
 */
function fmtRate2(n: number) {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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
    <div className="space-y-8 max-w-[110rem] mx-auto">
      <PageHeader eyebrow="" title="Pay Vouchers" subtitle="Your weekly earnings statements and payment history." />

      {!main ? (
        <div className="bg-white border border-slate-200/80 rounded-2xl p-12 text-center shadow-sm">
          <LuWallet size={32} className="mx-auto text-slate-300 mb-3" strokeWidth={1.5} />
          <p className="text-sm text-slate-500 font-medium">No pay vouchers yet.</p>
          <p className="text-xs text-slate-400 mt-1">Vouchers appear here once a pay cycle has been reviewed and finalised.</p>
        </div>
      ) : (
        <Voucher profile={profile} v={main} vouchers={vouchers} onSelect={setSelected} onDownload={handleDownload} />
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
function Voucher({ profile, v, vouchers, onSelect, onDownload }: {
  profile: ContractorVoucherProfile;
  v: ContractorVoucher;
  vouchers: ContractorVoucher[];
  onSelect: (weekStart: string) => void;
  onDownload: (weekStart: string) => void;
}) {
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
    <div className="space-y-4">
      {/* Week range selection. Offers only cycles that actually have a
          voucher — unlike the admin picker, which can browse any week — so a
          choice can never land on an empty statement. Hidden when there is
          just the one cycle to show. */}
      {vouchers.length > 1 && (
        <div className="flex items-center gap-3">
          <div className="ml-auto flex min-w-0 items-center gap-1 rounded-lg border border-slate-200 bg-white p-1 shadow-sm overflow-x-auto">
            <div className="flex gap-0.5">
              {vouchers.slice(0, 4).map((w) => (
                <button
                  key={w.weekStart}
                  onClick={() => onSelect(w.weekStart)}
                  className={`px-2 py-1 text-[10px] font-bold rounded-md whitespace-nowrap transition-all ${
                    v.weekStart === w.weekStart
                      ? "bg-[#003527] text-white shadow-sm"
                      : "text-slate-500 hover:text-[#003527] hover:bg-slate-100"
                  }`}
                >
                  {weekLabel(w.weekStart)}
                </button>
              ))}
            </div>
            <div className="h-4 w-px mx-0.5 shrink-0 bg-slate-200" />
            <select
              value={v.weekStart}
              onChange={(e) => onSelect(e.target.value)}
              aria-label="Select pay cycle"
              title="Every pay cycle you have a voucher for"
              className="h-6 shrink-0 rounded-md border border-slate-200 bg-white px-1.5 text-[10px] font-bold text-slate-600 outline-none focus:ring-2 focus:ring-teal-500"
            >
              {vouchers.map((w) => (
                <option key={w.weekStart} value={w.weekStart}>{fmtRange(w.rangeFrom, w.rangeTo)}</option>
              ))}
            </select>
          </div>
        </div>
      )}

      {/* Identity + cycle + rates, on one line rather than a tall summary
          block with its own rates card beside it. */}
      <section className="bg-white rounded-2xl border border-slate-200/80 shadow-sm px-5 py-4 flex flex-col lg:flex-row lg:items-center gap-4">
        <div className="min-w-0 flex-1">
          <h2 className="text-xl font-bold text-[#003527] tracking-tight truncate">{profile.name}</h2>
          <p className="text-xs text-slate-500 mt-0.5 truncate">
            {profile.role} · ID #{profile.contractorId.replace(/^#/, "")}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 lg:border-l lg:border-slate-100 lg:pl-6">
          {([
            ["Pay Cycle", fmtRange(v.rangeFrom, v.rangeTo)],
            ["Check Date", fmtDate(v.checkDate)],
            ["Monthly Rate", `${fmtRate(v.monthlyRate)} ${v.currency}`],
            ["Weekly Rate", `${fmtRate2(v.weeklyRate)} ${v.currency}`],
          ] as const).map(([label, value]) => (
            <div key={label} className="min-w-0">
              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">{label}</p>
              <p className="text-sm font-semibold text-slate-700 tabular-nums whitespace-nowrap">{value}</p>
            </div>
          ))}
        </div>
        <button
          onClick={() => onDownload(v.weekStart)}
          className="shrink-0 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-[#046B4D] hover:bg-[#035c42] text-white text-xs font-bold uppercase tracking-wider transition-colors"
        >
          <LuDownload size={15} strokeWidth={2} /> Download PDF
        </button>
      </section>

      {/* Net pay, and the two figures it comes from — the one line most people
          open a voucher to read, so it sits above the breakdown. */}
      <section className="bg-brand-900 text-white rounded-2xl shadow-sm px-5 py-4 flex flex-wrap items-center gap-x-8 gap-y-3">
        <div className="flex items-center gap-3 mr-auto">
          <div className="bg-white/10 p-2 rounded-full shrink-0"><LuWallet size={20} strokeWidth={2} /></div>
          <div>
            <p className="text-[10px] font-bold text-emerald-100/80 uppercase tracking-[0.18em]">Total Net Pay</p>
            <p className="text-2xl font-bold tabular-nums leading-tight">
              <span className="text-sm font-medium text-emerald-100/90 mr-1.5">{v.currency}</span>
              {money(t.netPay)}
            </p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-[9px] font-bold text-emerald-100/70 uppercase tracking-wider">Gross Pay</p>
          <p className="text-base font-semibold tabular-nums">{money(t.grossPay)}</p>
        </div>
        <div className="text-right">
          <p className="text-[9px] font-bold text-emerald-100/70 uppercase tracking-wider">Deductions</p>
          <p className="text-base font-semibold tabular-nums">−{money(t.totalDeductions)}</p>
        </div>
      </section>

      {/* One breakdown card in three columns, instead of separate Gross Pay
          and Deductions cards stacked down the page. */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
        <div className="bg-brand-900 px-5 py-2.5 flex items-center justify-between">
          <h3 className="text-white font-bold text-xs uppercase tracking-[0.18em]">Pay Breakdown</h3>
          <LuInfo size={16} className="text-emerald-200/80" strokeWidth={2} />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 divide-y lg:divide-y-0 lg:divide-x divide-slate-100">

          {/* Hours */}
          <div className="p-5 space-y-4">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Weekly Attendance</p>
            <div className="grid grid-cols-7 border border-slate-100 rounded-lg overflow-hidden">
              {weekDates.map((date, i) => {
                const label = DAY_LABELS[i];
                const isOff = restDayLabels.has(label);
                const hours = (v.evaluatedDailyMinutes[date] ?? 0) / 60;
                const dayOt = (v.regularOtDailyMinutes[date] ?? 0) / 60;
                const otInPlaceOfZero = !isOff && hours === 0 && dayOt > 0;
                return (
                  <div key={date} className={`px-1 py-1.5 text-center border-r border-slate-100 last:border-r-0 ${isOff ? "bg-slate-50" : "bg-white"}`}>
                    <p className="text-[9px] font-bold text-slate-400">{label}</p>
                    <p className={`text-xs font-bold tabular-nums ${isOff ? "text-slate-400" : otInPlaceOfZero ? "text-amber-600" : "text-emerald-900"}`}
                      title={otInPlaceOfZero ? "Regular OT earned this day — counted in OT HRS, not REG Hours" : undefined}>
                      {isOff ? "OFF" : (otInPlaceOfZero ? dayOt : hours).toFixed(2)}
                    </p>
                    {!otInPlaceOfZero && dayOt > 0 && (
                      <p className="text-[9px] font-semibold leading-tight text-amber-600 tabular-nums"
                        title="Regular OT earned this day — counted in OT HRS, not REG Hours">+{dayOt.toFixed(2)}</p>
                    )}
                  </div>
                );
              })}
            </div>
            <div>
              {([
                ["REG Hours", t.regHours, true],
                ["PTO HRS", v.ptoHours, false],
                ["HO HRS", t.usHolidayHours + t.localHolidayHours, false],
                ["OT HRS (REG/RD/HO)", otHours, false],
              ] as const).map(([label, value, strong]) => (
                <div key={label} className="flex justify-between items-center py-1.5 border-b border-dotted border-slate-100 last:border-0">
                  <span className={`text-xs ${strong ? "font-semibold text-slate-600" : "text-slate-500"}`}>{label}</span>
                  <span className={`text-sm font-bold tabular-nums ${value > 0 ? "text-emerald-900" : "text-slate-300"}`}>{value.toFixed(2)}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Earnings */}
          <div className="p-5 space-y-4">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Earnings</p>
            <div>
              {([
                ["Regular Hours Pay", t.regPay, true],
                ["Overtime (REG/RD/HO)", overtimePay, false],
                ["Holiday Pay (US/Local)", holidayPay, false],
                ["Time Off Pay", t.timeOffPay, false],
                ["Bonus & Miscellaneous", bonus + misc, false],
                ["Retroactive Pay & REIM", retroPay + reim, false],
              ] as const).map(([label, value, strong]) => (
                <div key={label} className="flex justify-between items-center py-1.5 border-b border-dotted border-slate-100 last:border-0">
                  <span className={`text-xs ${strong ? "font-semibold text-slate-600" : value > 0 ? "text-slate-600" : "text-slate-400"}`}>{label}</span>
                  <span className={`text-sm tabular-nums ${value > 0 ? "font-bold text-slate-700" : "text-slate-300"}`}>{money(value)}</span>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between rounded-xl bg-emerald-50 border border-emerald-700/20 px-4 py-2.5">
              <p className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider">Gross Pay</p>
              <p className="text-lg font-bold text-emerald-900 tabular-nums">{money(t.grossPay)}</p>
            </div>
          </div>

          {/* Deductions */}
          <div className="p-5 space-y-4">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Deductions</p>
            <div>
              {([
                ["Cash Advance", cashAdvance],
                ["HMO Premium", hmo],
              ] as const).map(([label, value]) => (
                <div key={label} className="flex justify-between items-center py-1.5 border-b border-dotted border-slate-100 last:border-0">
                  <span className={`text-xs ${value > 0 ? "text-slate-600" : "text-slate-400"}`}>{label}</span>
                  <span className={`text-sm tabular-nums ${value > 0 ? "font-bold text-slate-700" : "text-slate-300"}`}>{money(value)}</span>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between rounded-xl bg-slate-50 border border-slate-200 px-4 py-2.5">
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Total Deductions</p>
              <p className="text-lg font-bold text-slate-700 tabular-nums">{money(t.totalDeductions)}</p>
            </div>
            <div className="flex items-center justify-between rounded-xl bg-brand-900 px-4 py-2.5">
              <p className="text-[10px] font-bold text-emerald-100/80 uppercase tracking-wider">Net Pay</p>
              <p className="text-lg font-bold text-white tabular-nums">{money(t.netPay)}</p>
            </div>
          </div>
        </div>
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

  // Every figure is read straight off the frozen process_weekly_payroll row —
  // gross/deductions/net included, rather than re-summed from the components.
  const {
    ptoHours, regHours, regOtHours, rdOtHours, usHolidayHours, hoOtHours, localHolidayHours,
    ptoPay, sickPay, specialPay, advancePay,
    regPay, regOtPay, rdOtPay, usHolidayPay, hoOtPay, localHolidayPay,
  } = v;
  // Every paid-leave kind on the frozen row, on one line.
  const timeOffPay = ptoPay + sickPay + specialPay + advancePay;
  const { bonus, misc, retroPay, reim, cashAdvance, hmo } = v.adjustment;
  const grossPay = v.gross;
  const totalDeductions = v.deductions;
  const netPay = v.net;

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
        <p><span className="text-slate-500">Monthly Contract Rate</span> <span className="font-semibold ml-2">{fmtRate(v.monthlyRate)}</span></p>
        <p><span className="text-slate-500">Role</span> <span className="font-semibold ml-2">{profile.role}</span></p>
        <p><span className="text-slate-500">Weekly Contract Rate</span> <span className="font-semibold ml-2">{fmtRate2(v.weeklyRate)}</span></p>
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
                const otHours = (v.regularOtDailyMinutes[date] ?? 0) / 60;
                const otInPlaceOfZero = !isOff && hours === 0 && otHours > 0;
                return (
                  <td key={date} className="border border-slate-200 px-1 py-1.5 text-center tabular-nums">
                    <div className={otInPlaceOfZero ? "font-semibold text-amber-600" : undefined}
                      title={otInPlaceOfZero ? `Regular OT earned this day — counted in REG OT HRS, not REG Hours` : undefined}>
                      {isOff ? "OFF" : (otInPlaceOfZero ? otHours : hours).toFixed(2)}
                    </div>
                    {!otInPlaceOfZero && otHours > 0 && (
                      <div className="text-[9px] font-semibold leading-tight text-amber-600"
                        title={`Regular OT earned this day — counted in REG OT HRS, not REG Hours`}>
                        +{otHours.toFixed(2)}
                      </div>
                    )}
                  </td>
                );
              })}</tr>
            </tbody>
          </table>
          <div className="space-y-2 text-xs">
            {[
              ["REG Hours", regHours],
              ["PTO HRS", ptoHours],
              // Same combined line as the admin voucher.
              ["HO HRS", usHolidayHours + localHolidayHours],
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
            // Same combined line as the admin voucher — it's the same document,
            // so it must read identically whoever opens it.
            ["Holiday Pay", usHolidayPay + localHolidayPay],
            ["HO OT", hoOtPay],
            // Same combined line as the admin voucher.
            ["Time Off Pay", timeOffPay],
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
        Disclaimer: This pay voucher is provided solely for working hours calculation and contractor payment verification purposes. It is not intended to serve as an official payslip or proof of employment.
      </p>
    </div>
  );
}
