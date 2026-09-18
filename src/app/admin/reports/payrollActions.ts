"use server";

import { prisma } from "@/lib/prisma";
import { addDaysIso, sundayOf } from "@/lib/weekUtils";
import { canViewSalary } from "@/lib/salaryAccess";
import { decryptSalary } from "@/lib/salaryCrypto";

/**
 * Data for the Payroll Report: one row per contractor for a single Sun→Sat
 * week, from the processed snapshots.
 *
 * process_weekly_payroll rather than a live recomputation, deliberately. A
 * snapshot is the finalised record of a pay cycle — what was actually paid —
 * and re-deriving it here would produce a second, differently-rounded answer
 * for the same week the moment anything behind it changed.
 *
 * Every money column on that table is AES-256-GCM ciphertext, so the whole
 * report is behind the salary unlock: without one it returns no rows and says
 * so, rather than emitting a file of masked cells that looks like data.
 */

export type PayrollReportRow = {
  weekStart: string;
  weekEnd: string;
  name: string;
  contractorId: string;
  email: string;
  role: string;
  department: string;
  country: string;
  payCategory: string;
  currency: string;
  status: string;
  /** "date" -> minutes, for the Sun→Sat day columns. */
  dailyMinutes: Record<string, number>;
  actualMinutes: number;
  completionMinutes: number | null;
  hours: {
    reg: number; regOt: number; rdOt: number; usHoliday: number; hoOt: number;
    localHoliday: number; pto: number; sick: number; special: number; advance: number;
  };
  rates: { hourly: number; monthly: number; weekly: number };
  pay: {
    reg: number; regOt: number; rdOt: number; usHoliday: number; hoOt: number;
    localHoliday: number; pto: number; sick: number; special: number; advance: number;
    indHours: number; bonus: number; misc: number; retroPay: number; reim: number;
  };
  deductions: { cashAdvance: number; hmo: number; total: number };
  gross: number;
  net: number;
};

export type PayrollReportResult = {
  rows: PayrollReportRow[];
  /** False when the caller holds no salary unlock — no rows are returned. */
  salaryVisible: boolean;
  error?: string;
};

/** Ciphertext to a number. Blank and unparsable both read as 0. */
function money(value: unknown): number {
  const plain = decryptSalary(String(value ?? ""));
  const n = parseFloat(String(plain).replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

export async function fetchPayrollReport(params: {
  week: string;
  payCategory: string;
  department: string;
}): Promise<PayrollReportResult> {
  if (!(await canViewSalary())) {
    return {
      rows: [], salaryVisible: false,
      error: "This report contains pay figures. Unlock salary access first, then export.",
    };
  }

  const weekStart = sundayOf(params.week);
  if (!weekStart) return { rows: [], salaryVisible: true, error: "Pick a week." };
  const weekEnd = addDaysIso(weekStart, 6);

  const [snapshots, profiles] = await Promise.all([
    // weekStart is a plain "YYYY-MM-DD" string on this table, not a date.
    prisma.processWeeklyPayroll.findMany({ where: { weekStart } }),
    // contractorId is the one field the snapshot does not carry.
    prisma.contractorProfile.findMany({ select: { email: true, contractorId: true } }),
  ]);

  const contractorIdByEmail = new Map(
    profiles.map((p) => [String(p.email ?? "").trim().toLowerCase(), String(p.contractorId ?? "").trim()])
  );

  const rows: PayrollReportRow[] = snapshots
    .filter((s) =>
      (params.payCategory === "All" || (s.payCategory ?? "").trim() === params.payCategory) &&
      (params.department === "All" || (s.department ?? "").trim() === params.department)
    )
    .map((s): PayrollReportRow => {
      const cashAdvance = money(s.cashAdvance);
      const hmo = money(s.hmo);
      return {
        weekStart: s.weekStart,
        weekEnd: s.weekEnd || weekEnd,
        name: (s.name ?? "").trim(),
        contractorId: contractorIdByEmail.get(String(s.email ?? "").trim().toLowerCase()) ?? "",
        email: (s.email ?? "").trim(),
        role: (s.role ?? "").trim(),
        department: (s.department ?? "").trim(),
        country: (s.country ?? "").trim(),
        payCategory: (s.payCategory ?? "").trim(),
        currency: (s.currency ?? "").trim(),
        status: (s.status ?? "").trim(),
        dailyMinutes: (s.evaluatedDailyMinutes ?? {}) as Record<string, number>,
        actualMinutes: s.actualMinutes,
        completionMinutes: s.completionMinutes,
        hours: {
          reg: s.regHours, regOt: s.regOtHours, rdOt: s.rdOtHours,
          usHoliday: s.usHolidayHours, hoOt: s.hoOtHours, localHoliday: s.localHolidayHours,
          pto: s.ptoHours, sick: s.sickHours, special: s.specialHours, advance: s.advanceHours,
        },
        rates: { hourly: money(s.hourlyRate), monthly: money(s.monthlyRate), weekly: money(s.weeklyRate) },
        pay: {
          reg: money(s.regPay), regOt: money(s.regOtPay), rdOt: money(s.rdOtPay),
          usHoliday: money(s.usHolidayPay), hoOt: money(s.hoOtPay), localHoliday: money(s.localHolidayPay),
          pto: money(s.ptoPay), sick: money(s.sickPay), special: money(s.specialPay),
          advance: money(s.advancePay), indHours: money(s.indHoursPay),
          bonus: money(s.bonus), misc: money(s.misc), retroPay: money(s.retroPay), reim: money(s.reim),
        },
        // Read off the snapshot rather than re-added from the two above, so the
        // column reconciles against Gross and Net exactly as processed.
        deductions: { cashAdvance, hmo, total: money(s.deductions) },
        gross: money(s.gross),
        net: money(s.net),
      };
    });

  rows.sort((a, b) => a.name.localeCompare(b.name));
  return { rows, salaryVisible: true };
}
