"use client";

import Link from "next/link";
import { LuTrendingUp, LuTriangleAlert } from "react-icons/lu";
import { getDashboardMetrics } from "@/lib/data";
import { AnnouncementBoard } from "@/components/AnnouncementBoard";
import { HolidayCalendar } from "@/components/HolidayCalendar";

export default function AdminPage() {
  const m = getDashboardMetrics();

  const METRICS = [
    { label: "Active Total Contractors", value: m.totalActive,  delta: "+4% this month",       href: "/admin/contractors", highlight: true  },
    { label: "US Region",                value: m.us,           sub: "Headquarters & Field",   href: "/admin/contractors", highlight: false },
    { label: "Philippines",              value: m.philippines,  sub: "Support & Logistics",    href: "/admin/contractors", highlight: false },
    { label: "Mexico",                   value: m.mexico,       sub: "Manufacturing & Solar",  href: "/admin/contractors", highlight: false },
    { label: "India",                    value: m.india,        sub: "Tech & Engineering",     href: "/admin/contractors", highlight: false },
    { label: "PTO Today",                value: m.ptoToday,     sub: "Approved requests",      href: "/admin/time-off",    highlight: false },
    { label: "Absent Today",             value: m.absentToday,  sub: "Requires attention",     href: "/admin/attendance",  error: true, highlight: false },
  ];

  return (
    <div className="p-4 sm:p-6 md:p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6 md:mb-8">
        <h2 className="text-3xl md:text-4xl font-bold text-[#003527] tracking-tight">Dashboard</h2>
        <p className="text-sm md:text-base text-slate-500 mt-1">Real-time overview of global workforce and operations.</p>
      </div>

      {/* Metrics grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3 md:gap-4 mb-6 md:mb-8">
        {METRICS.map((card) => {
          if (card.highlight) {
            return (
              <Link key={card.label} href={card.href} className="col-span-2 sm:col-span-1 bg-[#003527] hover:bg-[#064e3b] text-white p-4 rounded-xl shadow-md flex flex-col justify-between transition-colors cursor-pointer">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider opacity-80">{card.label}</p>
                  <p className="text-4xl font-black mt-1">{card.value}</p>
                </div>
                <div className="mt-4 flex items-center gap-1 text-xs text-emerald-300">
                  <LuTrendingUp size={14} strokeWidth={2} />
                  {card.delta}
                </div>
              </Link>
            );
          }
          if (card.error) {
            return (
              <Link key={card.label} href={card.href} className="bg-red-100 hover:bg-red-200 text-red-800 p-4 rounded-xl shadow-sm flex flex-col justify-between transition-colors cursor-pointer">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider">{card.label}</p>
                  <p className="text-3xl font-black mt-1 text-red-600">{card.value}</p>
                </div>
                <div className="mt-4 flex items-center gap-1 text-xs">
                  <LuTriangleAlert size={13} strokeWidth={2} />
                  {card.sub}
                </div>
              </Link>
            );
          }
          return (
            <Link key={card.label} href={card.href} className="bg-white hover:bg-slate-50 p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between transition-colors cursor-pointer">
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{card.label}</p>
                <p className="text-3xl font-bold text-[#003527] mt-1">{card.value}</p>
              </div>
              <p className="mt-4 text-xs text-slate-400">{card.sub}</p>
            </Link>
          );
        })}
      </div>

      {/* Bottom grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 md:gap-8">
        {/* Announcement */}
        <AnnouncementBoard />

        {/* Holidays */}
        <HolidayCalendar />
      </div>
    </div>
  );
}
