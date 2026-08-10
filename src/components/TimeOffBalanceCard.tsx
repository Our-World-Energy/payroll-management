import type { ReactNode } from "react";
import { fmtBalance } from "@/lib/timeOffBalances";

export type TimeOffBalanceTone = "teal" | "orange" | "red" | "pink" | "blue" | "purple";

const TONES: Record<TimeOffBalanceTone, {
  cardBg: string; iconBg: string; title: string; label: string; value: string; bar: string; barTrack: string; pct: string;
}> = {
  red: {
    cardBg: "bg-red-50/70 border-red-200",
    iconBg: "bg-red-500",
    title: "text-red-900",
    label: "text-red-700/70",
    value: "text-red-700",
    bar: "bg-red-500",
    barTrack: "bg-red-100",
    pct: "text-red-600",
  },
  teal: {
    cardBg: "bg-teal-50/70 border-teal-100",
    iconBg: "bg-teal-600",
    title: "text-teal-900",
    label: "text-teal-700/70",
    value: "text-teal-900",
    bar: "bg-teal-500",
    barTrack: "bg-teal-100",
    pct: "text-teal-600",
  },
  orange: {
    cardBg: "bg-orange-50/70 border-orange-100",
    iconBg: "bg-orange-500",
    title: "text-orange-900",
    label: "text-orange-700/70",
    value: "text-orange-900",
    bar: "bg-orange-500",
    barTrack: "bg-orange-100",
    pct: "text-orange-600",
  },
  pink: {
    cardBg: "bg-pink-50/70 border-pink-200",
    iconBg: "bg-pink-500",
    title: "text-pink-900",
    label: "text-pink-700/70",
    value: "text-pink-900",
    bar: "bg-pink-500",
    barTrack: "bg-pink-100",
    pct: "text-pink-600",
  },
  blue: {
    cardBg: "bg-blue-50/70 border-blue-200",
    iconBg: "bg-blue-500",
    title: "text-blue-900",
    label: "text-blue-700/70",
    value: "text-blue-900",
    bar: "bg-blue-500",
    barTrack: "bg-blue-100",
    pct: "text-blue-600",
  },
  purple: {
    cardBg: "bg-purple-50/70 border-purple-200",
    iconBg: "bg-purple-500",
    title: "text-purple-900",
    label: "text-purple-700/70",
    value: "text-purple-900",
    bar: "bg-purple-500",
    barTrack: "bg-purple-100",
    pct: "text-purple-600",
  },
};

// Shared PTO/Medical Unavailability balance card — icon + title, ACCRUED/USED/AVAILABLE
// stats, and a linear progress bar showing % Available. Used on the
// Contractor Time Away Detail and Leave Override tabs (Time Away Management)
// and the standalone Current/New Request Data page, so all three stay
// visually identical.
export function TimeOffBalanceCard({ icon, title, tone, accrued, used, available, accruedLabel = "Accrued" }: {
  icon: ReactNode;
  title: string;
  tone: TimeOffBalanceTone;
  accrued: number;
  used: number;
  available: number;
  accruedLabel?: string;
}) {
  const c = TONES[tone];
  const availPct = accrued > 0 ? Math.max(0, Math.min(100, Math.round((available / accrued) * 100))) : 0;
  return (
    <div className={`rounded-2xl border p-5 ${c.cardBg}`}>
      <div className="flex items-center gap-3 mb-5">
        <div className={`w-10 h-10 rounded-xl grid place-items-center text-white shrink-0 ${c.iconBg}`}>{icon}</div>
        <h3 className={`text-base font-bold ${c.title}`}>{title}</h3>
      </div>
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div>
          <p className={`text-[10px] font-bold uppercase tracking-wider mb-1 ${c.label}`}>{accruedLabel}</p>
          <p className={`text-lg font-bold tabular-nums ${c.value}`}>{fmtBalance(accrued)}h</p>
        </div>
        <div>
          <p className={`text-[10px] font-bold uppercase tracking-wider mb-1 ${c.label}`}>Used</p>
          <p className={`text-lg font-bold tabular-nums ${c.value}`}>{fmtBalance(used)}h</p>
        </div>
        <div>
          <p className={`text-[10px] font-bold uppercase tracking-wider mb-1 ${c.label}`}>Available</p>
          <p className={`text-lg font-bold tabular-nums ${c.value}`}>{fmtBalance(available)}h</p>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <div className={`flex-1 h-2 rounded-full overflow-hidden ${c.barTrack}`}>
          <div className={`h-full rounded-full ${c.bar}`} style={{ width: `${availPct}%` }} />
        </div>
        <span className={`text-xs font-bold tabular-nums shrink-0 ${c.pct}`}>{availPct}%</span>
      </div>
    </div>
  );
}
