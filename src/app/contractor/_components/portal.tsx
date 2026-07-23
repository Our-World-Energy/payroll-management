import type { ReactNode } from "react";

// ─────────────────────────────────────────────────────────────────────────
// Shared presentational primitives for the Contractor Portal, so Profile,
// Attendance, Time-Off and Holidays share one visual language.
// ─────────────────────────────────────────────────────────────────────────

// Standard page header: an uppercase eyebrow with an accent hairline, a
// display-weight title, an optional subtitle, and an optional right-aligned
// slot (date chip, status pill, filter, …).
export function PageHeader({
  title, subtitle, eyebrow = "Contractor Portal", right,
}: {
  title: string;
  subtitle?: string;
  eyebrow?: string;
  right?: ReactNode;
}) {
  return (
    <header className="flex flex-col md:flex-row md:items-end justify-between gap-4">
      <div>
        <div className="flex items-center gap-2.5 mb-3">
          <span className="h-px w-8 bg-emerald-600/50" />
          <span className="text-[11px] font-bold uppercase tracking-[0.22em] text-emerald-700">{eyebrow}</span>
        </div>
        <h2 className="text-4xl md:text-[2.7rem] font-bold text-[#003527] leading-none" style={{ letterSpacing: "-0.025em" }}>
          {title}
        </h2>
        {subtitle && <p className="text-slate-500 mt-3">{subtitle}</p>}
      </div>
      {right && <div className="self-start md:self-auto shrink-0">{right}</div>}
    </header>
  );
}

// Pill/chip for the header's right slot (e.g. "Last updated: …").
export function HeaderChip({ icon, children }: { icon?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-center gap-2 text-xs font-medium text-slate-500 bg-white border border-slate-200/80 rounded-full pl-3.5 pr-4 py-2 shadow-sm">
      {icon}
      {children}
    </div>
  );
}

// Compact radial progress indicator (emerald→teal). The svg is rotated so the
// arc begins at 12 o'clock; the centre % label is rendered by the caller so it
// stays upright.
export function ProgressRing({ pct, size = 76, stroke = 7 }: { pct: number; size?: number; stroke?: number }) {
  const r      = (size - stroke) / 2;
  const circ   = 2 * Math.PI * r;
  const dash   = (Math.max(0, Math.min(pct, 100)) / 100) * circ;
  const gradId = `portal-ring-${size}-${stroke}`;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0 -rotate-90">
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%"   stopColor="#10b981" />
          <stop offset="100%" stopColor="#0d9488" />
        </linearGradient>
      </defs>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#eef2f0" strokeWidth={stroke} />
      <circle
        cx={size / 2} cy={size / 2} r={r} fill="none" stroke={`url(#${gradId})`}
        strokeWidth={stroke} strokeLinecap="round" strokeDasharray={`${dash} ${circ}`}
      />
    </svg>
  );
}
