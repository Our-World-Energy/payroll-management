"use client";

import { useState, useEffect } from "react";
import { LuMegaphone, LuPlus, LuX, LuChevronDown, LuPencil, LuLoader } from "react-icons/lu";
import {
  fetchAnnouncements, createAnnouncement, updateAnnouncement, deleteAnnouncement,
  type Announcement,
} from "@/app/admin/announcements/actions";

const LOCATIONS = [
  "All Locations",
  "Philippines",
  "Mexico",
  "India",
  "USA",
  "Offshore",
];

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
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [filterLocation, setFilterLocation] = useState("All Locations");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [location, setLocation] = useState(LOCATIONS[1]);
  const [date, setDate] = useState(todayIso());
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetchAnnouncements()
      .then((data) => { if (active) setAnnouncements(data); })
      .catch((e) => { if (active) setLoadError(e instanceof Error ? e.message : "Failed to load announcements."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  function resetForm() {
    setTitle("");
    setBody("");
    setLocation(LOCATIONS[1]);
    setDate(todayIso());
    setEditingId(null);
    setFormError("");
  }

  function openAddForm() {
    resetForm();
    setShowForm(true);
  }

  function openEditForm(a: Announcement) {
    setEditingId(a.id);
    setTitle(a.title);
    setBody(a.body);
    setLocation(a.location);
    setDate(a.date);
    setFormError("");
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    resetForm();
  }

  async function handleSubmit() {
    const t = title.trim();
    const b = body.trim();
    if (!t || !b || !date) return;
    setSubmitting(true);
    setFormError("");
    try {
      if (editingId != null) {
        await updateAnnouncement({ id: editingId, title: t, body: b, location, date });
        setAnnouncements((prev) =>
          prev.map((a) => (a.id === editingId ? { ...a, title: t, body: b, location, date } : a))
            .sort((a, z) => (a.date < z.date ? 1 : a.date > z.date ? -1 : 0))
        );
      } else {
        const created = await createAnnouncement({ title: t, body: b, location, date });
        setAnnouncements((prev) =>
          [created, ...prev].sort((a, z) => (a.date < z.date ? 1 : a.date > z.date ? -1 : 0))
        );
      }
      closeForm();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Failed to save announcement.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRemove(id: string) {
    setDeletingId(id);
    try {
      await deleteAnnouncement(id);
      setAnnouncements((prev) => prev.filter((a) => a.id !== id));
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Failed to delete announcement.");
    } finally {
      setDeletingId(null);
    }
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
            onClick={() => (showForm ? closeForm() : openAddForm())}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#003527] hover:bg-[#064e3b] text-white text-xs font-semibold rounded-lg transition-colors"
          >
            <LuPlus size={14} strokeWidth={2.5} />
            Add
          </button>
        </div>
      </div>

      {/* Add/Edit modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => !submitting && closeForm()} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col">
            {/* Modal header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="size-9 rounded-xl bg-[#003527] text-white grid place-items-center">
                  {editingId != null ? <LuPencil size={17} strokeWidth={2} /> : <LuMegaphone size={17} strokeWidth={2} />}
                </div>
                <div>
                  <h3 className="text-base font-bold text-[#003527]">{editingId != null ? "Edit Announcement" : "New Announcement"}</h3>
                  <p className="text-xs text-slate-400">Post to a specific location</p>
                </div>
              </div>
              <button onClick={closeForm} disabled={submitting} className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-40">
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
              {formError && <p className="text-xs font-medium text-red-600">{formError}</p>}
            </div>
            {/* Modal footer */}
            <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-3 bg-slate-50 rounded-b-2xl">
              <button
                onClick={closeForm}
                disabled={submitting}
                className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-200 rounded-lg transition-colors disabled:opacity-40"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="px-5 py-2 bg-[#003527] hover:bg-[#064e3b] text-white text-sm font-semibold rounded-lg transition-colors shadow-sm flex items-center gap-2 disabled:opacity-60"
              >
                {submitting
                  ? <LuLoader size={15} className="animate-spin" />
                  : editingId != null ? <LuPencil size={15} strokeWidth={2} /> : <LuMegaphone size={15} strokeWidth={2} />}
                {submitting ? "Saving…" : editingId != null ? "Save Changes" : "Post Announcement"}
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

      {loadError && <p className="text-xs font-medium text-red-600">{loadError}</p>}

      {/* List */}
      <div className="space-y-2 max-h-64 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-6">
            <LuLoader size={22} className="text-slate-300 animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
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
              <div className="shrink-0 flex items-center gap-1 self-start">
                <button
                  onClick={() => openEditForm(a)}
                  title="Edit announcement"
                  className="p-1 text-slate-300 hover:text-teal-600 transition-colors rounded"
                >
                  <LuPencil size={13} strokeWidth={2} />
                </button>
                <button
                  onClick={() => handleRemove(a.id)}
                  disabled={deletingId === a.id}
                  title="Delete announcement"
                  className="p-1 text-slate-300 hover:text-red-500 transition-colors rounded disabled:opacity-40"
                >
                  {deletingId === a.id ? <LuLoader size={14} className="animate-spin" /> : <LuX size={14} strokeWidth={2.5} />}
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
