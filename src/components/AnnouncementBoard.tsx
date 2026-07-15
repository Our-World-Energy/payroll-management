"use client";

import { useState } from "react";
import { LuMegaphone, LuPlus, LuX, LuChevronDown } from "react-icons/lu";

const LOCATIONS = [
  "All Locations",
  "Philippines",
  "Mexico",
  "India",
  "USA",
  "Offshore",
];

type Announcement = {
  id: number;
  title: string;
  body: string;
  location: string;
  date: string; // "YYYY-MM-DD" — the date this announcement is posted for
};

const INITIAL: Announcement[] = [];

const INPUT = "w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500 transition-all";
const SELECT = INPUT + " cursor-pointer appearance-none";

function todayIso() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

function formatAnnouncementDate(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function AnnouncementBoard() {
  const [announcements, setAnnouncements] = useState<Announcement[]>(INITIAL);
  const [filterLocation, setFilterLocation] = useState("All Locations");
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [location, setLocation] = useState(LOCATIONS[1]);
  const [date, setDate] = useState(todayIso());

  function handleAdd() {
    const t = title.trim();
    const b = body.trim();
    if (!t || !b || !date) return;
    setAnnouncements((prev) =>
      [{ id: Date.now(), title: t, body: b, location, date }, ...prev]
        .sort((a, z) => (a.date < z.date ? 1 : a.date > z.date ? -1 : 0))
    );
    setTitle("");
    setBody("");
    setLocation(LOCATIONS[1]);
    setDate(todayIso());
    setShowForm(false);
  }

  function handleRemove(id: number) {
    setAnnouncements((prev) => prev.filter((a) => a.id !== id));
  }

  const filtered =
    filterLocation === "All Locations"
      ? announcements
      : announcements.filter((a) => a.location === filterLocation);

  return (
    <div className="bg-white p-5 md:p-6 rounded-xl border border-slate-200 shadow-sm flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h4 className="text-xl md:text-2xl font-semibold text-[#003527]">Offshore Announcement</h4>
        <div className="flex items-center gap-2">
          <LuMegaphone size={22} strokeWidth={1.75} className="text-teal-600" />
          <button
            onClick={() => setShowForm((v) => !v)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#003527] hover:bg-[#064e3b] text-white text-xs font-semibold rounded-lg transition-colors"
          >
            <LuPlus size={14} strokeWidth={2.5} />
            Add
          </button>
        </div>
      </div>

      {/* Add modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowForm(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col">
            {/* Modal header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="size-9 rounded-xl bg-[#003527] text-white grid place-items-center">
                  <LuMegaphone size={17} strokeWidth={2} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-[#003527]">New Announcement</h3>
                  <p className="text-xs text-slate-400">Post to a specific location</p>
                </div>
              </div>
              <button onClick={() => setShowForm(false)} className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors">
                <LuX size={18} />
              </button>
            </div>
            {/* Modal body */}
            <div className="px-6 py-5 space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Title</label>
                <input
                  className={INPUT}
                  placeholder="e.g. Schedule Update"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Message</label>
                <textarea
                  rows={4}
                  className={INPUT + " resize-none"}
                  placeholder="Write your announcement here…"
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Location</label>
                  <div className="relative">
                    <select className={SELECT} value={location} onChange={(e) => setLocation(e.target.value)}>
                      {LOCATIONS.slice(1).map((l) => <option key={l}>{l}</option>)}
                    </select>
                    <LuChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Date</label>
                  <input type="date" className={INPUT} value={date} onChange={(e) => setDate(e.target.value)} />
                </div>
              </div>
            </div>
            {/* Modal footer */}
            <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-3 bg-slate-50 rounded-b-2xl">
              <button
                onClick={() => setShowForm(false)}
                className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-200 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleAdd}
                className="px-5 py-2 bg-[#003527] hover:bg-[#064e3b] text-white text-sm font-semibold rounded-lg transition-colors shadow-sm flex items-center gap-2"
              >
                <LuMegaphone size={15} strokeWidth={2} />
                Post Announcement
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Filter */}
      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Filter:</span>
        <div className="relative">
          <select
            className="text-xs border border-slate-200 rounded-lg pl-3 pr-7 py-1.5 bg-slate-50 text-slate-700 focus:outline-none focus:ring-2 focus:ring-teal-500 cursor-pointer appearance-none"
            value={filterLocation}
            onChange={(e) => setFilterLocation(e.target.value)}
          >
            {LOCATIONS.map((l) => <option key={l}>{l}</option>)}
          </select>
          <LuChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
        </div>
      </div>

      {/* List */}
      <div className="space-y-2 max-h-64 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="p-4 bg-slate-50 rounded-lg border border-slate-100">
            <p className="text-sm text-slate-500">
              No new announcements for today. All offshore teams are operating as scheduled.
            </p>
          </div>
        ) : (
          filtered.map((a) => (
            <div key={a.id} className="p-3 bg-slate-50 rounded-lg border border-slate-100 flex gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                  <span className="text-sm font-semibold text-[#003527]">{a.title}</span>
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-teal-50 text-teal-700 border border-teal-100">
                    {a.location}
                  </span>
                </div>
                <p className="text-xs text-slate-500 leading-relaxed">{a.body}</p>
                <p className="text-xs text-slate-400 mt-1">{formatAnnouncementDate(a.date)}</p>
              </div>
              <button
                onClick={() => handleRemove(a.id)}
                className="shrink-0 p-1 text-slate-300 hover:text-red-500 transition-colors rounded self-start"
              >
                <LuX size={14} strokeWidth={2.5} />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
