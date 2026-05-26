"use client";

import { useState } from "react";
import { LuPlus, LuX, LuChevronDown, LuChevronUp } from "react-icons/lu";
import { useContractorConfig, type DeptTree } from "@/components/ContractorConfigContext";

const INPUT  = "w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500 transition-all";
const SELECT = INPUT + " cursor-pointer";

export default function SettingsPage() {
  const { officeLocations, setOfficeLocations, deptTree, setDeptTree } = useContractorConfig();

  // ── Office location state ─────────────────────────────────────────────────
  const [newLocation, setNewLocation] = useState("");

  function addLocation() {
    const v = newLocation.trim();
    if (!v || officeLocations.includes(v)) return;
    setOfficeLocations([...officeLocations, v]);
    setNewLocation("");
  }

  function removeLocation(loc: string) {
    setOfficeLocations(officeLocations.filter((l) => l !== loc));
  }

  // ── Role management state ─────────────────────────────────────────────────
  const [expandedDept, setExpandedDept]   = useState<string | null>(null);
  const [expandedSub,  setExpandedSub]    = useState<string | null>(null);
  const [newDept,      setNewDept]        = useState("");
  const [newSub,       setNewSub]         = useState<Record<string, string>>({});
  const [newRole,      setNewRole]        = useState<Record<string, string>>({});

  function addDepartment() {
    const v = newDept.trim();
    if (!v || deptTree[v]) return;
    setDeptTree({ ...deptTree, [v]: {} });
    setNewDept("");
  }

  function removeDepartment(dept: string) {
    const next: DeptTree = { ...deptTree };
    delete next[dept];
    setDeptTree(next);
    if (expandedDept === dept) setExpandedDept(null);
  }

  function addSubDepartment(dept: string) {
    const v = (newSub[dept] ?? "").trim();
    if (!v || deptTree[dept]?.[v]) return;
    setDeptTree({ ...deptTree, [dept]: { ...deptTree[dept], [v]: [] } });
    setNewSub({ ...newSub, [dept]: "" });
  }

  function removeSubDepartment(dept: string, sub: string) {
    const next: DeptTree = { ...deptTree, [dept]: { ...deptTree[dept] } };
    delete next[dept][sub];
    setDeptTree(next);
    if (expandedSub === `${dept}::${sub}`) setExpandedSub(null);
  }

  function addRole(dept: string, sub: string) {
    const key = `${dept}::${sub}`;
    const v   = (newRole[key] ?? "").trim();
    if (!v || deptTree[dept]?.[sub]?.includes(v)) return;
    setDeptTree({
      ...deptTree,
      [dept]: { ...deptTree[dept], [sub]: [...(deptTree[dept][sub] ?? []), v] },
    });
    setNewRole({ ...newRole, [key]: "" });
  }

  function removeRole(dept: string, sub: string, role: string) {
    setDeptTree({
      ...deptTree,
      [dept]: { ...deptTree[dept], [sub]: deptTree[dept][sub].filter((r) => r !== role) },
    });
  }

  return (
    <div className="p-6 md:p-8 max-w-5xl mx-auto space-y-6">
      <div className="mb-2">
        <h2 className="text-3xl md:text-4xl font-bold text-[#003527] tracking-tight">Settings</h2>
        <p className="text-sm text-slate-500 mt-1">Manage organisation-wide configuration.</p>
      </div>

      {/* Organisation */}
      <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100">
          <h4 className="text-base font-semibold text-[#003527]">Organisation</h4>
        </div>
        <div className="px-6 py-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Company Name</label>
              <input defaultValue="Our World Energy" className={INPUT} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">System Label</label>
              <input defaultValue="Contractor Management System" className={INPUT} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Default Timezone</label>
              <select className={SELECT}>
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
      </section>

      {/* Office Locations */}
      <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h4 className="text-base font-semibold text-[#003527]">Office Locations</h4>
            <p className="text-xs text-slate-400 mt-0.5">These appear in the Office Location dropdown when adding a contractor.</p>
          </div>
          <span className="text-xs font-semibold text-slate-400 bg-slate-100 px-2 py-1 rounded-full">{officeLocations.length} locations</span>
        </div>
        <div className="px-6 py-5 space-y-4">
          {/* Add new */}
          <div className="flex gap-2">
            <input
              value={newLocation}
              onChange={(e) => setNewLocation(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addLocation()}
              placeholder="e.g. OWE [NY, New York]"
              className={INPUT}
            />
            <button
              onClick={addLocation}
              className="shrink-0 inline-flex items-center gap-1.5 px-4 py-2 bg-[#003527] text-white text-sm font-semibold rounded-lg hover:bg-[#064E3B] transition-colors"
            >
              <LuPlus size={15} strokeWidth={2.5} />
              Add
            </button>
          </div>
          {/* List */}
          <div className="flex flex-wrap gap-2 max-h-64 overflow-y-auto">
            {officeLocations.map((loc) => (
              <span key={loc} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-700">
                {loc}
                <button onClick={() => removeLocation(loc)} className="text-slate-300 hover:text-red-500 transition-colors ml-0.5">
                  <LuX size={13} strokeWidth={2.5} />
                </button>
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Department / Sub-department / Roles */}
      <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h4 className="text-base font-semibold text-[#003527]">Departments, Sub-departments & Roles</h4>
            <p className="text-xs text-slate-400 mt-0.5">Manage the interconnected dropdowns shown in the Add Contractor form.</p>
          </div>
          <span className="text-xs font-semibold text-slate-400 bg-slate-100 px-2 py-1 rounded-full">{Object.keys(deptTree).length} departments</span>
        </div>
        <div className="px-6 py-5 space-y-3">
          {/* Add department */}
          <div className="flex gap-2 mb-4">
            <input
              value={newDept}
              onChange={(e) => setNewDept(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addDepartment()}
              placeholder="New department name"
              className={INPUT}
            />
            <button
              onClick={addDepartment}
              className="shrink-0 inline-flex items-center gap-1.5 px-4 py-2 bg-[#003527] text-white text-sm font-semibold rounded-lg hover:bg-[#064E3B] transition-colors"
            >
              <LuPlus size={15} strokeWidth={2.5} />
              Add Dept
            </button>
          </div>

          {/* Department list */}
          {Object.entries(deptTree).map(([dept, subs]) => (
            <div key={dept} className="border border-slate-200 rounded-xl overflow-hidden">
              {/* Dept header */}
              <div className="flex items-center justify-between px-4 py-3 bg-slate-50">
                <button
                  onClick={() => setExpandedDept(expandedDept === dept ? null : dept)}
                  className="flex items-center gap-2 text-sm font-semibold text-[#003527] flex-1 text-left"
                >
                  {expandedDept === dept ? <LuChevronUp size={15} /> : <LuChevronDown size={15} />}
                  {dept}
                  <span className="text-xs font-normal text-slate-400 ml-1">{Object.keys(subs).length} sub-dept{Object.keys(subs).length !== 1 ? "s" : ""}</span>
                </button>
                <button onClick={() => removeDepartment(dept)} className="p-1 text-slate-300 hover:text-red-500 transition-colors rounded">
                  <LuX size={14} strokeWidth={2.5} />
                </button>
              </div>

              {expandedDept === dept && (
                <div className="px-4 py-3 space-y-3 border-t border-slate-100">
                  {/* Add sub-dept */}
                  <div className="flex gap-2">
                    <input
                      value={newSub[dept] ?? ""}
                      onChange={(e) => setNewSub({ ...newSub, [dept]: e.target.value })}
                      onKeyDown={(e) => e.key === "Enter" && addSubDepartment(dept)}
                      placeholder="New sub-department"
                      className="flex-1 border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                    />
                    <button onClick={() => addSubDepartment(dept)}
                      className="shrink-0 inline-flex items-center gap-1 px-3 py-1.5 bg-teal-600 text-white text-xs font-semibold rounded-lg hover:bg-teal-700 transition-colors">
                      <LuPlus size={13} strokeWidth={2.5} />Add Sub
                    </button>
                  </div>

                  {/* Sub-dept list */}
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
                          <button onClick={() => removeSubDepartment(dept, sub)} className="p-0.5 text-slate-300 hover:text-red-500 transition-colors rounded">
                            <LuX size={13} strokeWidth={2.5} />
                          </button>
                        </div>

                        {expandedSub === subKey && (
                          <div className="px-3 py-2 space-y-2 border-t border-slate-100">
                            {/* Add role */}
                            <div className="flex gap-2">
                              <input
                                value={newRole[subKey] ?? ""}
                                onChange={(e) => setNewRole({ ...newRole, [subKey]: e.target.value })}
                                onKeyDown={(e) => e.key === "Enter" && addRole(dept, sub)}
                                placeholder="New role"
                                className="flex-1 border border-slate-200 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-teal-500"
                              />
                              <button onClick={() => addRole(dept, sub)}
                                className="shrink-0 inline-flex items-center gap-1 px-3 py-1.5 bg-slate-700 text-white text-xs font-semibold rounded-lg hover:bg-slate-800 transition-colors">
                                <LuPlus size={12} strokeWidth={2.5} />Role
                              </button>
                            </div>
                            {/* Role pills */}
                            <div className="flex flex-wrap gap-1.5">
                              {roles.map((role) => (
                                <span key={role} className="inline-flex items-center gap-1 px-2.5 py-1 bg-white border border-slate-200 rounded-lg text-xs text-slate-600">
                                  {role}
                                  <button onClick={() => removeRole(dept, sub, role)} className="text-slate-300 hover:text-red-500 transition-colors">
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
      </section>

      {/* Payroll */}
      <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100">
          <h4 className="text-base font-semibold text-[#003527]">Payroll</h4>
        </div>
        <div className="px-6 py-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Pay Cycle</label>
              <select className={SELECT}>
                <option>Bi-weekly (every 2 weeks)</option>
                <option>Monthly</option><option>Weekly</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Default Tax Rate (%)</label>
              <input type="number" defaultValue={15} className={INPUT} />
            </div>
          </div>
        </div>
      </section>

      {/* Notifications */}
      <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100">
          <h4 className="text-base font-semibold text-[#003527]">Notifications</h4>
        </div>
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
      </section>

      <div className="flex justify-end">
        <button className="bg-[#003527] hover:bg-[#064E3B] text-white text-sm font-semibold px-6 py-2.5 rounded-lg transition-colors shadow-sm">
          Save Changes
        </button>
      </div>
    </div>
  );
}
