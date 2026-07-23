"use client";

import { useEffect, useState } from "react";
import { LuPlus, LuX, LuChevronDown, LuChevronUp, LuTriangle, LuLoader } from "react-icons/lu";
import { useContractorConfig, type DeptTree } from "@/components/ContractorConfigContext";
import {
  addOfficeLocation, removeOfficeLocation,
  addManager, removeManager,
  addCountryLocation, removeCountryLocation,
  addDepartment, removeDepartment,
  addSubDepartment, removeSubDepartment,
  addRole, removeRole,
  fetchCutOffTime, saveCutOffTime,
} from "./actions";

const INPUT  = "w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500 transition-all";
const SELECT = INPUT + " cursor-pointer";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// Month/day only (no year) — this is a recurring annual cutoff, so Feb is
// given 29 days to allow the leap-year date rather than locking it out.
function daysInMonth(monthIndex: number) {
  return new Date(2000, monthIndex + 1, 0).getDate();
}

export default function SettingsPage() {
  const {
    officeLocations, setOfficeLocations,
    deptTree, setDeptTree,
    managers, setManagers,
    countryLocations, setCountryLocations,
  } = useContractorConfig();

  // ── Busy/error state ──────────────────────────────────────────────────────
  const [busy, setBusy]     = useState(false);
  const [errMsg, setErrMsg] = useState<string | null>(null);

  // ── Section collapse state (all collapsed by default) ────────────────────
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    organisation: false,
    officeLocations: false,
    managers: false,
    countryLocations: false,
    departments: false,
    timeOff: false,
    notifications: false,
  });
  function toggleSection(key: string) {
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  // ── Time Off cut off date (month + day, no year — recurs every year) ─────
  // Local edits only take effect once "Save" is clicked, tracked against the
  // last-saved values so the button can enable/disable and show confirmation.
  const [cutoffMonth, setCutoffMonth] = useState(0);
  const [cutoffDay,   setCutoffDay]   = useState(1);
  const [savedCutoffMonth, setSavedCutoffMonth] = useState(0);
  const [savedCutoffDay,   setSavedCutoffDay]   = useState(1);
  const [cutoffSaving, setCutoffSaving] = useState(false);
  const [cutoffSaved,  setCutoffSaved]  = useState(false);
  const [cutoffError,  setCutoffError]  = useState<string | null>(null);

  useEffect(() => {
    fetchCutOffTime().then((saved) => {
      if (!saved) return;
      const monthIndex = MONTHS.indexOf(saved.monthName);
      if (monthIndex >= 0) { setCutoffMonth(monthIndex); setSavedCutoffMonth(monthIndex); }
      setCutoffDay(saved.monthNo);
      setSavedCutoffDay(saved.monthNo);
    });
  }, []);

  const cutoffDirty = cutoffMonth !== savedCutoffMonth || cutoffDay !== savedCutoffDay;

  function handleCutoffMonthChange(monthIndex: number) {
    setCutoffMonth(monthIndex);
    setCutoffDay((day) => Math.min(day, daysInMonth(monthIndex)));
    setCutoffSaved(false);
  }

  function handleCutoffDayChange(day: number) {
    setCutoffDay(day);
    setCutoffSaved(false);
  }

  async function handleSaveCutOff() {
    setCutoffSaving(true);
    setCutoffError(null);
    try {
      const res = await saveCutOffTime(MONTHS[cutoffMonth], cutoffDay);
      if (!res.ok) {
        setCutoffError(res.error ?? "Unknown error");
      } else {
        setSavedCutoffMonth(cutoffMonth);
        setSavedCutoffDay(cutoffDay);
        setCutoffSaved(true);
      }
    } catch (e) {
      setCutoffError(String(e));
    } finally {
      setCutoffSaving(false);
    }
  }

  async function run(fn: () => Promise<{ ok: boolean; error?: string }>, revertFn?: () => void) {
    setBusy(true);
    setErrMsg(null);
    try {
      const res = await fn();
      if (!res.ok) {
        setErrMsg(res.error ?? "Unknown error");
        revertFn?.();
      }
    } catch (e) {
      setErrMsg(String(e));
      revertFn?.();
    } finally {
      setBusy(false);
    }
  }

  // ── Confirm delete popup ──────────────────────────────────────────────────
  type ConfirmTarget = { label: string; onConfirm: () => void };
  const [confirm, setConfirm] = useState<ConfirmTarget | null>(null);

  function askConfirm(label: string, onConfirm: () => void) {
    setConfirm({ label, onConfirm });
  }

  // ── Office location handlers ──────────────────────────────────────────────
  const [newLocation, setNewLocation] = useState("");

  async function handleAddLocation() {
    const v = newLocation.trim();
    if (!v || officeLocations.includes(v)) return;
    const prev = officeLocations;
    setOfficeLocations([...officeLocations, v]);
    setNewLocation("");
    await run(() => addOfficeLocation(v), () => setOfficeLocations(prev));
  }

  async function handleRemoveLocation(loc: string) {
    const prev = officeLocations;
    setOfficeLocations(officeLocations.filter((l) => l !== loc));
    await run(() => removeOfficeLocation(loc), () => setOfficeLocations(prev));
  }

  // ── Manager handlers ──────────────────────────────────────────────────────
  const [newManager, setNewManager] = useState("");

  async function handleAddManager() {
    const v = newManager.trim();
    if (!v || managers.includes(v)) return;
    const prev = managers;
    setManagers([...managers, v]);
    setNewManager("");
    await run(() => addManager(v), () => setManagers(prev));
  }

  async function handleRemoveManager(m: string) {
    const prev = managers;
    setManagers(managers.filter((x) => x !== m));
    await run(() => removeManager(m), () => setManagers(prev));
  }

  // ── Country location handlers ─────────────────────────────────────────────
  const [newCountry, setNewCountry] = useState("");

  async function handleAddCountry() {
    const v = newCountry.trim();
    if (!v || countryLocations.includes(v)) return;
    const prev = countryLocations;
    setCountryLocations([...countryLocations, v]);
    setNewCountry("");
    await run(() => addCountryLocation(v), () => setCountryLocations(prev));
  }

  async function handleRemoveCountry(c: string) {
    const prev = countryLocations;
    setCountryLocations(countryLocations.filter((x) => x !== c));
    await run(() => removeCountryLocation(c), () => setCountryLocations(prev));
  }

  // ── Dept/sub/role state ───────────────────────────────────────────────────
  const [expandedDept, setExpandedDept] = useState<string | null>(null);
  const [expandedSub,  setExpandedSub]  = useState<string | null>(null);
  const [newDept,      setNewDept]      = useState("");
  const [newSub,       setNewSub]       = useState<Record<string, string>>({});
  const [newRole,      setNewRole]      = useState<Record<string, string>>({});

  async function handleAddDepartment() {
    const v = newDept.trim();
    if (!v || deptTree[v]) return;
    const prev = deptTree;
    setDeptTree({ ...deptTree, [v]: {} });
    setNewDept("");
    await run(() => addDepartment(v), () => setDeptTree(prev));
  }

  async function handleRemoveDepartment(dept: string) {
    const prev = deptTree;
    const next: DeptTree = { ...deptTree };
    delete next[dept];
    setDeptTree(next);
    if (expandedDept === dept) setExpandedDept(null);
    await run(() => removeDepartment(dept), () => setDeptTree(prev));
  }

  async function handleAddSubDepartment(dept: string) {
    const v = (newSub[dept] ?? "").trim();
    if (!v || deptTree[dept]?.[v]) return;
    const prev = deptTree;
    setDeptTree({ ...deptTree, [dept]: { ...deptTree[dept], [v]: [] } });
    setNewSub({ ...newSub, [dept]: "" });
    await run(() => addSubDepartment(dept, v), () => setDeptTree(prev));
  }

  async function handleRemoveSubDepartment(dept: string, sub: string) {
    const prev = deptTree;
    const next: DeptTree = { ...deptTree, [dept]: { ...deptTree[dept] } };
    delete next[dept][sub];
    setDeptTree(next);
    if (expandedSub === `${dept}::${sub}`) setExpandedSub(null);
    await run(() => removeSubDepartment(dept, sub), () => setDeptTree(prev));
  }

  async function handleAddRole(dept: string, sub: string) {
    const key = `${dept}::${sub}`;
    const v   = (newRole[key] ?? "").trim();
    if (!v || deptTree[dept]?.[sub]?.includes(v)) return;
    const prev = deptTree;
    setDeptTree({
      ...deptTree,
      [dept]: { ...deptTree[dept], [sub]: [...(deptTree[dept][sub] ?? []), v] },
    });
    setNewRole({ ...newRole, [key]: "" });
    await run(() => addRole(dept, sub, v), () => setDeptTree(prev));
  }

  async function handleRemoveRole(dept: string, sub: string, role: string) {
    const prev = deptTree;
    setDeptTree({
      ...deptTree,
      [dept]: { ...deptTree[dept], [sub]: deptTree[dept][sub].filter((r) => r !== role) },
    });
    await run(() => removeRole(dept, sub, role), () => setDeptTree(prev));
  }

  return (
    <div className="p-6 md:p-8 max-w-5xl mx-auto space-y-6">

      {/* Confirm delete modal */}
      {confirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setConfirm(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <div className="flex items-start gap-4">
              <div className="shrink-0 size-11 rounded-xl bg-red-50 flex items-center justify-center">
                <LuTriangle size={22} className="text-red-500" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-800">Confirm Delete</h3>
                <p className="text-sm text-slate-500 mt-1">
                  Are you sure you want to remove <span className="font-semibold text-slate-700">&ldquo;{confirm.label}&rdquo;</span>? This cannot be undone.
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setConfirm(null)} className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
                Cancel
              </button>
              <button
                onClick={() => { confirm.onConfirm(); setConfirm(null); }}
                className="px-5 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold rounded-lg transition-colors shadow-sm flex items-center gap-2"
              >
                <LuX size={15} strokeWidth={2} />
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="mb-2 flex items-center justify-between">
        <div>
          <h2 className="text-3xl md:text-4xl font-bold text-[#003527] tracking-tight">Settings</h2>
          <p className="text-sm text-slate-500 mt-1">Manage organisation-wide configuration.</p>
        </div>
        {busy && (
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <LuLoader size={15} className="animate-spin" />
            Saving…
          </div>
        )}
      </div>

      {errMsg && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
          {errMsg}
        </div>
      )}

      {/* Organisation */}
      <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <button
          onClick={() => toggleSection("organisation")}
          className="w-full px-6 py-4 border-b border-slate-100 flex items-center gap-2 text-left"
        >
          {openSections.organisation ? <LuChevronUp size={15} className="text-slate-400 shrink-0" /> : <LuChevronDown size={15} className="text-slate-400 shrink-0" />}
          <h4 className="text-base font-semibold text-[#003527]">Organisation</h4>
        </button>
        {openSections.organisation && (
          <div className="px-6 py-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Default Timezone</label>
                <select className={SELECT}>
                  <option>UTC (Coordinated Universal Time)</option>
                  <option>UTC−5 (Eastern Time)</option>
                  <option>UTC+5:30 (India)</option>
                  <option>UTC−6 (Central Time)</option>
                  <option>UTC+8 (Philippines)</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Fiscal Year Start</label>
                <select className={SELECT}>
                  <option>January</option><option>April</option>
                  <option>July</option><option>October</option>
                </select>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* Office Locations */}
      <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <button onClick={() => toggleSection("officeLocations")} className="flex items-start gap-2 text-left flex-1">
            {openSections.officeLocations ? <LuChevronUp size={15} className="text-slate-400 shrink-0 mt-0.5" /> : <LuChevronDown size={15} className="text-slate-400 shrink-0 mt-0.5" />}
            <div>
              <h4 className="text-base font-semibold text-[#003527]">Office Locations</h4>
              <p className="text-xs text-slate-400 mt-0.5">These appear in the Office Location dropdown when adding a contractor.</p>
            </div>
          </button>
          <span className="text-xs font-semibold text-slate-400 bg-slate-100 px-2 py-1 rounded-full">{officeLocations.length} locations</span>
        </div>
        {openSections.officeLocations && (
          <div className="px-6 py-5 space-y-4">
            <div className="flex gap-2">
              <input
                value={newLocation}
                onChange={(e) => setNewLocation(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAddLocation()}
                placeholder="e.g. OWE [NY, New York]"
                className={INPUT}
              />
              <button onClick={handleAddLocation} disabled={busy}
                className="shrink-0 inline-flex items-center gap-1.5 px-4 py-2 bg-[#003527] text-white text-sm font-semibold rounded-lg hover:bg-[#064E3B] transition-colors disabled:opacity-50">
                <LuPlus size={15} strokeWidth={2.5} />Add
              </button>
            </div>
            <div className="flex flex-wrap gap-2 max-h-64 overflow-y-auto">
              {officeLocations.map((loc) => (
                <span key={loc} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-700">
                  {loc}
                  <button onClick={() => askConfirm(loc, () => handleRemoveLocation(loc))} className="text-slate-300 hover:text-red-500 transition-colors ml-0.5">
                    <LuX size={13} strokeWidth={2.5} />
                  </button>
                </span>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* Managers */}
      <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <button onClick={() => toggleSection("managers")} className="flex items-start gap-2 text-left flex-1">
            {openSections.managers ? <LuChevronUp size={15} className="text-slate-400 shrink-0 mt-0.5" /> : <LuChevronDown size={15} className="text-slate-400 shrink-0 mt-0.5" />}
            <div>
              <h4 className="text-base font-semibold text-[#003527]">Managers</h4>
              <p className="text-xs text-slate-400 mt-0.5">These appear in the Manager dropdown when adding a contractor.</p>
            </div>
          </button>
          <span className="text-xs font-semibold text-slate-400 bg-slate-100 px-2 py-1 rounded-full">{managers.length} managers</span>
        </div>
        {openSections.managers && (
          <div className="px-6 py-5 space-y-4">
            <div className="flex gap-2">
              <input
                value={newManager}
                onChange={(e) => setNewManager(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAddManager()}
                placeholder="e.g. Jane Smith"
                className={INPUT}
              />
              <button onClick={handleAddManager} disabled={busy}
                className="shrink-0 inline-flex items-center gap-1.5 px-4 py-2 bg-[#003527] text-white text-sm font-semibold rounded-lg hover:bg-[#064E3B] transition-colors disabled:opacity-50">
                <LuPlus size={15} strokeWidth={2.5} />Add
              </button>
            </div>
            <div className="flex flex-wrap gap-2 max-h-48 overflow-y-auto">
              {managers.map((m) => (
                <span key={m} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-700">
                  {m}
                  <button onClick={() => askConfirm(m, () => handleRemoveManager(m))} className="text-slate-300 hover:text-red-500 transition-colors ml-0.5">
                    <LuX size={13} strokeWidth={2.5} />
                  </button>
                </span>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* Country Locations */}
      <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <button onClick={() => toggleSection("countryLocations")} className="flex items-start gap-2 text-left flex-1">
            {openSections.countryLocations ? <LuChevronUp size={15} className="text-slate-400 shrink-0 mt-0.5" /> : <LuChevronDown size={15} className="text-slate-400 shrink-0 mt-0.5" />}
            <div>
              <h4 className="text-base font-semibold text-[#003527]">Country Locations</h4>
              <p className="text-xs text-slate-400 mt-0.5">These appear in the Country dropdown when adding a contractor.</p>
            </div>
          </button>
          <span className="text-xs font-semibold text-slate-400 bg-slate-100 px-2 py-1 rounded-full">{countryLocations.length} countries</span>
        </div>
        {openSections.countryLocations && (
          <div className="px-6 py-5 space-y-4">
            <div className="flex gap-2">
              <input
                value={newCountry}
                onChange={(e) => setNewCountry(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAddCountry()}
                placeholder="e.g. Colombia"
                className={INPUT}
              />
              <button onClick={handleAddCountry} disabled={busy}
                className="shrink-0 inline-flex items-center gap-1.5 px-4 py-2 bg-[#003527] text-white text-sm font-semibold rounded-lg hover:bg-[#064E3B] transition-colors disabled:opacity-50">
                <LuPlus size={15} strokeWidth={2.5} />Add
              </button>
            </div>
            <div className="flex flex-wrap gap-2 max-h-48 overflow-y-auto">
              {countryLocations.map((c) => (
                <span key={c} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-700">
                  {c}
                  <button onClick={() => askConfirm(c, () => handleRemoveCountry(c))} className="text-slate-300 hover:text-red-500 transition-colors ml-0.5">
                    <LuX size={13} strokeWidth={2.5} />
                  </button>
                </span>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* Department / Sub-department / Roles */}
      <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <button onClick={() => toggleSection("departments")} className="flex items-start gap-2 text-left flex-1">
            {openSections.departments ? <LuChevronUp size={15} className="text-slate-400 shrink-0 mt-0.5" /> : <LuChevronDown size={15} className="text-slate-400 shrink-0 mt-0.5" />}
            <div>
              <h4 className="text-base font-semibold text-[#003527]">Departments, Sub-departments & Roles</h4>
              <p className="text-xs text-slate-400 mt-0.5">Manage the interconnected dropdowns shown in the Add Contractor form.</p>
            </div>
          </button>
          <span className="text-xs font-semibold text-slate-400 bg-slate-100 px-2 py-1 rounded-full">{Object.keys(deptTree).length} departments</span>
        </div>
        {openSections.departments && (
        <div className="px-6 py-5 space-y-3">
          <div className="flex gap-2 mb-4">
            <input
              value={newDept}
              onChange={(e) => setNewDept(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAddDepartment()}
              placeholder="New department name"
              className={INPUT}
            />
            <button onClick={handleAddDepartment} disabled={busy}
              className="shrink-0 inline-flex items-center gap-1.5 px-4 py-2 bg-[#003527] text-white text-sm font-semibold rounded-lg hover:bg-[#064E3B] transition-colors disabled:opacity-50">
              <LuPlus size={15} strokeWidth={2.5} />Add Dept
            </button>
          </div>

          {Object.entries(deptTree).map(([dept, subs]) => (
            <div key={dept} className="border border-slate-200 rounded-xl overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 bg-slate-50">
                <button
                  onClick={() => setExpandedDept(expandedDept === dept ? null : dept)}
                  className="flex items-center gap-2 text-sm font-semibold text-[#003527] flex-1 text-left"
                >
                  {expandedDept === dept ? <LuChevronUp size={15} /> : <LuChevronDown size={15} />}
                  {dept}
                  <span className="text-xs font-normal text-slate-400 ml-1">{Object.keys(subs).length} sub-dept{Object.keys(subs).length !== 1 ? "s" : ""}</span>
                </button>
                <button onClick={() => askConfirm(dept, () => handleRemoveDepartment(dept))} className="p-1 text-slate-300 hover:text-red-500 transition-colors rounded">
                  <LuX size={14} strokeWidth={2.5} />
                </button>
              </div>

              {expandedDept === dept && (
                <div className="px-4 py-3 space-y-3 border-t border-slate-100">
                  <div className="flex gap-2">
                    <input
                      value={newSub[dept] ?? ""}
                      onChange={(e) => setNewSub({ ...newSub, [dept]: e.target.value })}
                      onKeyDown={(e) => e.key === "Enter" && handleAddSubDepartment(dept)}
                      placeholder="New sub-department"
                      className="flex-1 border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                    />
                    <button onClick={() => handleAddSubDepartment(dept)} disabled={busy}
                      className="shrink-0 inline-flex items-center gap-1 px-3 py-1.5 bg-teal-600 text-white text-xs font-semibold rounded-lg hover:bg-teal-700 transition-colors disabled:opacity-50">
                      <LuPlus size={13} strokeWidth={2.5} />Add Sub
                    </button>
                  </div>

                  {Object.entries(subs).map(([sub, roles]) => {
                    const subKey = `${dept}::${sub}`;
                    return (
                      <div key={sub} className="border border-slate-100 rounded-lg overflow-hidden ml-2">
                        <div className="flex items-center justify-between px-3 py-2 bg-slate-50/70">
                          <button
                            onClick={() => setExpandedSub(expandedSub === subKey ? null : subKey)}
                            className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 flex-1 text-left"
                          >
                            {expandedSub === subKey ? <LuChevronUp size={13} /> : <LuChevronDown size={13} />}
                            {sub}
                            <span className="font-normal text-slate-400 ml-1">{roles.length} role{roles.length !== 1 ? "s" : ""}</span>
                          </button>
                          <button onClick={() => askConfirm(sub, () => handleRemoveSubDepartment(dept, sub))} className="p-0.5 text-slate-300 hover:text-red-500 transition-colors rounded">
                            <LuX size={13} strokeWidth={2.5} />
                          </button>
                        </div>

                        {expandedSub === subKey && (
                          <div className="px-3 py-2 space-y-2 border-t border-slate-100">
                            <div className="flex gap-2">
                              <input
                                value={newRole[subKey] ?? ""}
                                onChange={(e) => setNewRole({ ...newRole, [subKey]: e.target.value })}
                                onKeyDown={(e) => e.key === "Enter" && handleAddRole(dept, sub)}
                                placeholder="New role"
                                className="flex-1 border border-slate-200 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-teal-500"
                              />
                              <button onClick={() => handleAddRole(dept, sub)} disabled={busy}
                                className="shrink-0 inline-flex items-center gap-1 px-3 py-1.5 bg-slate-700 text-white text-xs font-semibold rounded-lg hover:bg-slate-800 transition-colors disabled:opacity-50">
                                <LuPlus size={12} strokeWidth={2.5} />Role
                              </button>
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                              {roles.map((role) => (
                                <span key={role} className="inline-flex items-center gap-1 px-2.5 py-1 bg-white border border-slate-200 rounded-lg text-xs text-slate-600">
                                  {role}
                                  <button onClick={() => askConfirm(role, () => handleRemoveRole(dept, sub, role))} className="text-slate-300 hover:text-red-500 transition-colors">
                                    <LuX size={11} strokeWidth={2.5} />
                                  </button>
                                </span>
                              ))}
                              {roles.length === 0 && <span className="text-xs text-slate-400 italic">No roles yet</span>}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </div>
        )}
      </section>

      {/* Time Off Settings */}
      <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <button
          onClick={() => toggleSection("timeOff")}
          className="w-full px-6 py-4 border-b border-slate-100 flex items-center gap-2 text-left"
        >
          {openSections.timeOff ? <LuChevronUp size={15} className="text-slate-400 shrink-0" /> : <LuChevronDown size={15} className="text-slate-400 shrink-0" />}
          <h4 className="text-base font-semibold text-[#003527]">Time Off Settings</h4>
        </button>
        {openSections.timeOff && (
          <div className="px-6 py-5">
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Cut Off Time</label>
              <div className="flex flex-wrap items-center gap-3">
                <div className="grid grid-cols-2 gap-3 max-w-sm">
                  <select
                    className={SELECT}
                    value={cutoffMonth}
                    onChange={(e) => handleCutoffMonthChange(Number(e.target.value))}
                  >
                    {MONTHS.map((m, i) => <option key={m} value={i}>{m}</option>)}
                  </select>
                  <select
                    className={SELECT}
                    value={cutoffDay}
                    onChange={(e) => handleCutoffDayChange(Number(e.target.value))}
                  >
                    {Array.from({ length: daysInMonth(cutoffMonth) }, (_, i) => i + 1).map((d) => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                </div>
                <button
                  onClick={handleSaveCutOff}
                  disabled={!cutoffDirty || cutoffSaving}
                  className="shrink-0 px-4 py-2 bg-[#003527] text-white text-sm font-semibold rounded-lg hover:bg-[#064E3B] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {cutoffSaving ? "Saving…" : "Save"}
                </button>
                {!cutoffDirty && cutoffSaved && (
                  <span className="text-xs font-semibold text-emerald-600">Saved</span>
                )}
              </div>
              {cutoffError && <p className="mt-2 text-xs font-medium text-red-600">{cutoffError}</p>}
            </div>
          </div>
        )}
      </section>

      {/* Notifications */}
      <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <button
          onClick={() => toggleSection("notifications")}
          className="w-full px-6 py-4 border-b border-slate-100 flex items-center gap-2 text-left"
        >
          {openSections.notifications ? <LuChevronUp size={15} className="text-slate-400 shrink-0" /> : <LuChevronDown size={15} className="text-slate-400 shrink-0" />}
          <h4 className="text-base font-semibold text-[#003527]">Notifications</h4>
        </button>
        {openSections.notifications && (
          <div className="px-6 py-5 space-y-3">
            {[
              "Email alerts for certification expiry",
              "Notify admin on new leave requests",
              "Weekly payroll summary digest",
              "Absence alerts (same-day)",
            ].map((label) => (
              <label key={label} className="flex items-center justify-between py-2 border-b border-slate-50 last:border-0 cursor-pointer">
                <span className="text-sm text-slate-700">{label}</span>
                <div className="relative">
                  <input type="checkbox" defaultChecked className="sr-only peer" />
                  <div className="w-10 h-5 bg-slate-200 peer-checked:bg-teal-500 rounded-full transition-colors" />
                  <div className="absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-all peer-checked:translate-x-5" />
                </div>
              </label>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
