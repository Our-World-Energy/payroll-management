"use client";

import { useState, useEffect, useMemo } from "react";
import { LuCalendarDays, LuLoaderCircle, LuSave, LuX } from "react-icons/lu";
import { toast } from "sonner";
import { addDaysIso, datesBetween, parseIsoDate, recentWeeks, sundayOf, weekLabel } from "@/lib/weekUtils";
import { fetchShiftSchedule, saveShiftSchedule } from "@/app/admin/contractors/shiftSchedule";
import type { ShiftScheduleDay } from "@/app/admin/contractors/shiftScheduleShared";

// 30-minute slots, matching the Shift Start / Shift End pickers in
// AddContractorModal so both produce the same "h:mm AM/PM" strings.
const TIME_OPTIONS: string[] = [];
for (let h = 0; h < 24; h++) {
  for (const m of [0, 30]) {
    const period = h < 12 ? "AM" : "PM";
    const hour = h === 0 ? 12 : h > 12 ? h - 12 : h;
    TIME_OPTIONS.push(`${hour}:${m === 0 ? "00" : "30"} ${period}`);
  }
}

const SELECT = "w-full h-9 rounded-lg border border-slate-200 bg-white px-2 text-sm text-slate-800 outline-none transition-all hover:border-slate-300 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/30";

type Props = {
  email: string;
  contractorName: string;
  /** Typical Non-Working Days, as full day names ("Monday", "Sunday"). Dates
   *  falling on one are flagged red — a shift assigned on a rest day is
   *  usually a mistake, and the admin should see it before saving. */
  restDays?: string[];
  onClose: () => void;
};

export function ShiftScheduleModal({ email, contractorName, restDays = [], onClose }: Props) {
  const restDaySet = useMemo(
    () => new Set(restDays.map((d) => d.trim().toLowerCase()).filter(Boolean)),
    [restDays]
  );

  function isRestDay(dateIso: string) {
    return restDaySet.has(parseIsoDate(dateIso).toLocaleDateString("en-US", { weekday: "long" }).toLowerCase());
  }

  // Week options run from the current Arizona week backwards, plus the next
  // four weeks ahead — a shifting schedule is usually set before the week runs.
  const weeks = useMemo(() => {
    const past = recentWeeks(12);
    const upcoming = Array.from({ length: 4 }, (_, i) => addDaysIso(past[0], 7 * (i + 1))).reverse();
    return [...upcoming, ...past];
  }, []);

  const [week, setWeek] = useState(weeks.find((w) => w === sundayOf(new Date().toISOString().slice(0, 10))) ?? weeks[4] ?? weeks[0]);
  const [rows, setRows] = useState<ShiftScheduleDay[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [savedNote, setSavedNote] = useState("");

  const weekDates = useMemo(() => datesBetween(week, addDaysIso(week, 6)), [week]);

  useEffect(() => {
    let isMounted = true;

    async function load() {
      setLoading(true);
      setError("");
      setSavedNote("");
      try {
        const saved = await fetchShiftSchedule(email, week, addDaysIso(week, 6));
        if (!isMounted) return;
        const savedByDate = new Map(saved.map((d) => [d.date, d]));
        setRows(weekDates.map((date) => savedByDate.get(date) ?? { date, shiftStart: "", shiftEnd: "" }));
      } catch (err) {
        if (!isMounted) return;
        setRows(weekDates.map((date) => ({ date, shiftStart: "", shiftEnd: "" })));
        setError(err instanceof Error ? err.message : "Unable to load the saved schedule.");
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    load();
    return () => {
      isMounted = false;
    };
  }, [email, week, weekDates]);

  function setDay(date: string, field: "shiftStart" | "shiftEnd", value: string) {
    setSavedNote("");
    setRows((current) => current.map((row) => (row.date === date ? { ...row, [field]: value } : row)));
  }

  // Fills every remaining blank day from the first day that has both times —
  // most shifting schedules only differ on a couple of days.
  function copyFirstToBlanks() {
    const source = rows.find((r) => r.shiftStart && r.shiftEnd);
    if (!source) return;
    setSavedNote("");
    setRows((current) => current.map((row) => (
      row.shiftStart || row.shiftEnd ? row : { ...row, shiftStart: source.shiftStart, shiftEnd: source.shiftEnd }
    )));
  }

  function clearAll() {
    setSavedNote("");
    setRows((current) => current.map((row) => ({ ...row, shiftStart: "", shiftEnd: "" })));
  }

  async function handleSave() {
    // A half-filled row can't be evaluated against, so it's rejected rather
    // than silently dropped.
    const halfFilled = rows.filter((r) => Boolean(r.shiftStart) !== Boolean(r.shiftEnd));
    if (halfFilled.length) {
      setError(`Set both a start and an end for ${halfFilled.map((r) => formatShortDate(r.date)).join(", ")}, or clear both.`);
      return;
    }

    setSaving(true);
    setError("");
    try {
      await saveShiftSchedule(email, rows);
      const filled = rows.filter((r) => r.shiftStart && r.shiftEnd).length;
      const onRestDays = rows.filter((r) => r.shiftStart && r.shiftEnd && isRestDay(r.date)).length;

      setSavedNote(`Saved ${filled} day${filled === 1 ? "" : "s"} for ${weekLabel(week)}.`);
      toast.success("Shift schedule saved successfully", {
        description: `${filled} day${filled === 1 ? "" : "s"} saved for ${weekLabel(week)}`
          + (onRestDays > 0 ? ` · ${onRestDays} on a non-working day` : ""),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to save the schedule.";
      setError(message);
      toast.error("Could not save the shift schedule", { description: message });
    } finally {
      setSaving(false);
    }
  }

  function formatShortDate(date: string) {
    return parseIsoDate(date).toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" });
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-2xl max-h-[90vh] flex flex-col rounded-2xl bg-white shadow-2xl overflow-hidden">
        <div className="flex items-start justify-between gap-4 px-6 py-4 bg-[#003527]">
          <div className="flex items-center gap-3">
            <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-white/10 text-white">
              <LuCalendarDays size={18} strokeWidth={2} />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white">Shift Schedule</h3>
              <p className="text-xs text-white/60 mt-0.5">{contractorName || email} · saved per date</p>
            </div>
          </div>
          <button onClick={onClose} aria-label="Close"
            className="grid size-8 place-items-center rounded-lg text-white/70 hover:bg-white/10 hover:text-white transition-colors">
            <LuX size={18} />
          </button>
        </div>

        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/60 flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">Week Range</label>
            <select value={week} onChange={(e) => setWeek(e.target.value)} aria-label="Select week range"
              className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-sm font-semibold text-slate-700 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/30">
              {weeks.map((w) => <option key={w} value={w}>{weekLabel(w)} ({w.slice(0, 4)})</option>)}
            </select>
          </div>
          <div className="flex items-center gap-2 ml-auto">
            <button type="button" onClick={copyFirstToBlanks}
              className="h-9 px-3 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors">
              Fill blanks from first day
            </button>
            <button type="button" onClick={clearAll}
              className="h-9 px-3 rounded-lg text-xs font-semibold text-slate-500 hover:text-red-600 hover:bg-red-50 transition-colors">
              Clear week
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-auto">
          {loading ? (
            <p className="px-6 py-10 text-center text-sm font-medium text-slate-500 inline-flex items-center gap-2 w-full justify-center">
              <LuLoaderCircle size={14} className="animate-spin" /> Loading saved schedule…
            </p>
          ) : (
            <table className="w-full text-left" style={{ minWidth: 520 }}>
              <thead className="sticky top-0 bg-slate-50 border-b border-slate-200">
                <tr>
                  {["Date", "Day", "Shift Start", "Shift End"].map((h) => (
                    <th key={h} className="px-5 py-3 text-[10px] font-bold uppercase tracking-widest text-slate-500 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((row) => {
                  const isSet = Boolean(row.shiftStart && row.shiftEnd);
                  const restDay = isRestDay(row.date);
                  return (
                    // Rest day wins over the "filled" tint — the point is that
                    // it stays visible even once hours have been entered.
                    <tr key={row.date} className={restDay ? "bg-red-50" : isSet ? "bg-emerald-50/40" : ""}>
                      <td className={`px-5 py-2.5 text-sm font-semibold whitespace-nowrap tabular-nums ${restDay ? "text-red-800" : "text-slate-800"}`}>
                        {formatShortDate(row.date)}
                      </td>
                      <td className={`px-5 py-2.5 text-sm whitespace-nowrap ${restDay ? "text-red-700" : "text-slate-600"}`}>
                        {parseIsoDate(row.date).toLocaleDateString("en-US", { weekday: "long" })}
                        {restDay && (
                          <span className="ml-2 inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-700 align-middle">
                            Non-Working
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-2.5" style={{ minWidth: 140 }}>
                        <select className={SELECT} value={row.shiftStart} aria-label={`Shift start for ${row.date}`}
                          onChange={(e) => setDay(row.date, "shiftStart", e.target.value)}>
                          <option value="">—</option>
                          {TIME_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
                        </select>
                      </td>
                      <td className="px-5 py-2.5" style={{ minWidth: 140 }}>
                        <select className={SELECT} value={row.shiftEnd} aria-label={`Shift end for ${row.date}`}
                          onChange={(e) => setDay(row.date, "shiftEnd", e.target.value)}>
                          <option value="">—</option>
                          {TIME_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
                        </select>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs font-medium min-h-4">
            {error && <span className="text-red-600">{error}</span>}
            {!error && savedNote && <span className="text-emerald-700">{savedNote}</span>}
            {!error && !savedNote && (
              <span className="text-slate-400">
                Leave a day blank to use no shift window for that date.
                {restDaySet.size > 0 && <> Rows in <span className="font-semibold text-red-600">red</span> are the contractor&apos;s non-working days.</>}
              </span>
            )}
          </p>
          <div className="flex items-center gap-2">
            <button type="button" onClick={onClose}
              className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-200 rounded-lg transition-colors">
              Close
            </button>
            <button type="button" onClick={handleSave} disabled={saving || loading}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#003527] text-sm font-semibold text-white shadow-sm hover:bg-[#064E3B] transition-colors disabled:opacity-50">
              {saving ? <LuLoaderCircle size={14} className="animate-spin" /> : <LuSave size={14} strokeWidth={2} />}
              {saving ? "Saving…" : "Save Schedule"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
