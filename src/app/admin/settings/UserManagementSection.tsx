"use client";

import { useState } from "react";
import { LuChevronDown, LuChevronUp } from "react-icons/lu";
import { UsersView } from "../users/UsersView";

/**
 * Settings → User Management. Renders the same view as the /admin/users route
 * (one component, so the two can't drift), minus its page header — this
 * section's own heading takes that role.
 *
 * The view is mounted only while the section is open: it lists every auth
 * account, which is several hundred rows and a paged GoTrue sweep, and that
 * shouldn't run every time someone opens Settings for something else.
 */
export function UserManagementSection() {
  const [open, setOpen] = useState(false);

  return (
    <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <button onClick={() => setOpen((v) => !v)} className="w-full px-6 py-4 border-b border-slate-100 flex items-start gap-2 text-left">
        {open ? <LuChevronUp size={15} className="text-slate-400 shrink-0 mt-0.5" /> : <LuChevronDown size={15} className="text-slate-400 shrink-0 mt-0.5" />}
        <div>
          <h4 className="text-base font-semibold text-[#003527]">User Management</h4>
          <p className="text-xs text-slate-400 mt-0.5">Create accounts and set the role that decides what each person sees.</p>
        </div>
      </button>

      {open && (
        <div className="px-6 py-5">
          <UsersView embedded />
        </div>
      )}
    </section>
  );
}
