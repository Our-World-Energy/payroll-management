"use client";

import { useState, useEffect } from "react";
import { LuMegaphone, LuPlus, LuX, LuChevronDown, LuPencil, LuLoader, LuUpload, LuCircleAlert } from "react-icons/lu";
import {
  fetchAnnouncements, createAnnouncement, updateAnnouncement, deleteAnnouncement,
  uploadAnnouncementImage, removeAnnouncementImage,
  type Announcement,
} from "@/app/admin/announcements/actions";
import { ANNOUNCEMENT_IMAGE } from "@/lib/announcementImage";

// Shown as "Banner". Broadcast as an animated banner on every contractor's
// Dashboard, and only once its date arrives — the only kind that is date-gated.
// Listed first so that difference is easy to find.
const GLOBAL = "Global";

// Shown as "All Locations". Addressed to every country rather than to a place:
// the Contractor Portal shows it to everyone alongside their own country's
// announcements. Unlike Banner it isn't date-gated and isn't a banner.
const OFFSHORE = "Offshore";

const ANY_LOCATION = "All Locations"; // the filter's no-filter sentinel

const LOCATIONS = [
  ANY_LOCATION,
  GLOBAL,
  "Philippines",
  "Mexico",
  "India",
  "Guatemala",
  "Colombia",
  OFFSHORE,
];

// Display labels only — the stored `location` values stay "Global" and
// "Offshore", so existing rows keep working and the Contractor Portal's
// filtering (which matches those values) needs no change.
//
// The filter's own no-filter option is relabelled "Show All" so it can't be
// mistaken for Offshore's new "All Locations" label.
const LOCATION_LABEL: Record<string, string> = {
  [GLOBAL]: "Banner",
  [OFFSHORE]: "All Locations",
  [ANY_LOCATION]: "Show All",
};

function locationLabel(location: string) {
  return LOCATION_LABEL[location] ?? location;
}

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
  const [filterLocation, setFilterLocation] = useState(ANY_LOCATION);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [location, setLocation] = useState(LOCATIONS[1]);
  const [date, setDate] = useState(todayIso());
  // Uploaded straight away so the preview is the real stored file rather than
  // a local blob that might fail to upload at save time.
  const [imageUrl, setImageUrl] = useState("");
  const [imageBusy, setImageBusy] = useState(false);
  const [imageAlert, setImageAlert] = useState<{ title: string; detail: string } | null>(null);

  async function handlePickImage(file: File | undefined) {
    if (!file) return;

    // Checked here, before the upload: an oversized file would otherwise be
    // rejected only after being sent, and past a point Next kills the request
    // itself so nothing readable comes back.
    if (!(ANNOUNCEMENT_IMAGE.formats as readonly string[]).includes(file.type)) {
      setImageAlert({
        title: "That file type isn't supported",
        detail: `Choose a ${ANNOUNCEMENT_IMAGE.formatLabel} image.`,
      });
      return;
    }
    if (file.size > ANNOUNCEMENT_IMAGE.maxBytes) {
      setImageAlert({
        title: `Image is too large (${(file.size / 1024 / 1024).toFixed(1)} MB)`,
        detail: `The maximum size is ${ANNOUNCEMENT_IMAGE.maxLabel}. Resize or compress the image and try again — ${ANNOUNCEMENT_IMAGE.recommended} is plenty for the Dashboard.`,
      });
      return;
    }

    setImageBusy(true);
    const form = new FormData();
    form.append("file", file);
    const res = await uploadAnnouncementImage(form);
    setImageBusy(false);
    if (!res.ok) { setImageAlert({ title: "Upload failed", detail: res.error }); return; }
    // Replacing an image leaves the old file orphaned in the bucket otherwise.
    if (imageUrl) await removeAnnouncementImage(imageUrl).catch(() => {});
    setImageUrl(res.url);
  }

  async function handleClearImage() {
    const previous = imageUrl;
    setImageUrl("");
    setImageAlert(null);
    if (previous) await removeAnnouncementImage(previous).catch(() => {});
  }
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
    setImageUrl("");
    setImageAlert(null);
    setEditingId(null);
    setFormError("");
  }

  // A Global announcement is date-gated on the Contractor Portal, so whether
  // it has gone live yet is worth showing. Carried over from the Settings
  // section this replaces.
  const today = todayIso();

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
    setImageUrl(a.imageUrl);
    setImageAlert(null);
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
        await updateAnnouncement({ id: editingId, title: t, body: b, location, imageUrl, date });
        setAnnouncements((prev) =>
          prev.map((a) => (a.id === editingId ? { ...a, title: t, body: b, location, date } : a))
            .sort((a, z) => (a.date < z.date ? 1 : a.date > z.date ? -1 : 0))
        );
      } else {
        const created = await createAnnouncement({ title: t, body: b, location, imageUrl, date });
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
    filterLocation === ANY_LOCATION
      ? announcements
      : announcements.filter((a) => a.location === filterLocation);

  return (
    <div className="bg-white p-5 md:p-6 rounded-xl border border-slate-200 shadow-sm flex flex-col gap-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-y-2">
        <div className="flex items-center gap-2 min-w-0">
          <LuMegaphone size={22} strokeWidth={1.75} className="text-teal-600 shrink-0" />
          <h4 className="text-sm font-semibold text-[#003527] truncate">Announcements</h4>
        </div>
        <button
          onClick={() => (showForm ? closeForm() : openAddForm())}
          className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#003527] hover:bg-[#064e3b] text-white text-xs font-semibold rounded-lg transition-colors"
        >
          <LuPlus size={14} strokeWidth={2.5} />
          Add
        </button>
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
                      {LOCATIONS.slice(1).map((l) => <option key={l} value={l}>{locationLabel(l)}</option>)}
                    </select>
                    <LuChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    {location === GLOBAL ? "Date to Announce" : "Date"}
                  </label>
                  <input type="date" className={INPUT} value={date} onChange={(e) => setDate(e.target.value)} />
                </div>
              </div>
              {/* Image — replaces the Dashboard's generated emoji tile, for the
                  banner and for the per-location list alike. */}
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  Image <span className="font-normal normal-case tracking-normal text-slate-400">(optional)</span>
                </label>
                <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/60 p-3">
                  {imageUrl ? (
                    <div className="flex items-start gap-3">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={imageUrl}
                        alt="Announcement image preview"
                        className="h-20 w-40 rounded-lg object-cover border border-slate-200 bg-white shrink-0"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold text-[#003527]">Image attached</p>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          This replaces the icon on the Dashboard.
                        </p>
                        <div className="flex items-center gap-2 mt-2">
                          <label className="cursor-pointer inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-[11px] font-semibold text-slate-600 hover:bg-slate-100 transition-colors">
                            <LuUpload size={12} strokeWidth={2} /> Replace
                            <input
                              type="file"
                              accept={ANNOUNCEMENT_IMAGE.formats.join(",")}
                              className="hidden"
                              onChange={(e) => handlePickImage(e.target.files?.[0])}
                            />
                          </label>
                          <button
                            type="button"
                            onClick={handleClearImage}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-red-200 bg-white text-[11px] font-semibold text-red-600 hover:bg-red-50 transition-colors"
                          >
                            <LuX size={12} strokeWidth={2.5} /> Remove
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <label className="flex items-center gap-3 cursor-pointer">
                      <span className="grid place-items-center size-10 rounded-lg bg-white border border-slate-200 text-slate-400 shrink-0">
                        {imageBusy ? <LuLoader size={16} className="animate-spin" /> : <LuUpload size={16} strokeWidth={2} />}
                      </span>
                      <span className="min-w-0">
                        <span className="block text-xs font-semibold text-[#003527]">
                          {imageBusy ? "Uploading…" : "Upload an image"}
                        </span>
                        <span className="block text-[11px] text-slate-400">
                          Leave empty to keep the generated icon.
                        </span>
                      </span>
                      <input
                        type="file"
                        accept={ANNOUNCEMENT_IMAGE.formats.join(",")}
                        disabled={imageBusy}
                        className="hidden"
                        onChange={(e) => handlePickImage(e.target.files?.[0])}
                      />
                    </label>
                  )}
                  <p className="mt-2 pt-2 border-t border-slate-200 text-[11px] text-slate-500 leading-relaxed">
                    <span className="font-semibold text-slate-600">Recommended</span> {ANNOUNCEMENT_IMAGE.recommended}
                    <span className="text-slate-300"> · </span>
                    <span className="font-semibold text-slate-600">Minimum</span> {ANNOUNCEMENT_IMAGE.minimum}
                    <br />
                    <span className="font-semibold text-slate-600">Format</span> {ANNOUNCEMENT_IMAGE.formatLabel}
                    <span className="text-slate-300"> · </span>
                    <span className="font-semibold text-slate-600">Max size</span> {ANNOUNCEMENT_IMAGE.maxLabel}
                    <br />
                    Wide images crop to fill — keep the subject centred.
                  </p>
                </div>
              </div>

              {location === GLOBAL && (
                <p className="text-xs text-purple-700 bg-purple-50 border border-purple-100 rounded-lg px-3 py-2">
                  Banner shows an animated banner on every contractor&apos;s Dashboard, and only once the date above arrives.
                </p>
              )}
              {location === OFFSHORE && (
                <p className="text-xs text-teal-700 bg-teal-50 border border-teal-100 rounded-lg px-3 py-2">
                  All Locations reaches contractors in every country — it appears in the Announcements list on all
                  Dashboards straight away, rather than being scoped to one country.
                </p>
              )}
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

      {/* Image problem — shown as its own dialog so it can't be missed
          under the form. */}
      {imageAlert && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setImageAlert(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <div className="flex items-start gap-3">
              <span className="grid place-items-center size-9 rounded-full bg-red-50 text-red-600 shrink-0">
                <LuCircleAlert size={18} strokeWidth={2} />
              </span>
              <div className="min-w-0">
                <h3 className="text-base font-bold text-[#003527]">{imageAlert.title}</h3>
                <p className="text-sm text-slate-500 mt-1 leading-relaxed">{imageAlert.detail}</p>
              </div>
            </div>
            <div className="flex justify-end mt-5">
              <button
                onClick={() => setImageAlert(null)}
                className="px-5 py-2 bg-[#003527] hover:bg-[#064e3b] text-white text-sm font-semibold rounded-lg transition-colors"
              >
                OK
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
            {LOCATIONS.map((l) => <option key={l} value={l}>{locationLabel(l)}</option>)}
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
          filtered.map((a) => {
            const isGlobal = a.location === GLOBAL;
            const isLive = a.date <= today;
            return (
            <div key={a.id} className={`p-3 rounded-lg border flex gap-3 ${isGlobal ? "bg-purple-50/60 border-purple-100" : "bg-slate-50 border-slate-100"}`}>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                  <span className="text-sm font-semibold text-[#003527]">{a.title}</span>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${isGlobal ? "bg-purple-100 text-purple-700 border-purple-200" : "bg-teal-50 text-teal-700 border-teal-100"}`}>
                    {locationLabel(a.location)}
                  </span>
                  {/* Only Global is date-gated, so only Global gets a live/scheduled state. */}
                  {isGlobal && (
                    <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${isLive ? "text-emerald-700 bg-emerald-50" : "text-amber-700 bg-amber-50"}`}>
                      {isLive ? `Live since ${formatAnnouncementDate(a.date)}` : `Scheduled for ${formatAnnouncementDate(a.date)}`}
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-500 leading-relaxed">{a.body}</p>
                {!isGlobal && <p className="text-xs text-slate-400 mt-1">{formatAnnouncementDate(a.date)}</p>}
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
            );
          })
        )}
      </div>
    </div>
  );
}
