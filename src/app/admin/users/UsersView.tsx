"use client";

import { useEffect, useState, useTransition } from "react";
import {
  LuUsers, LuPlus, LuTrash2, LuX, LuLoader, LuShieldCheck, LuUser,
  LuChevronRight, LuRefreshCw, LuKey, LuCircleCheck, LuCircleX, LuUserCheck, LuSearch,
  LuHeartHandshake, LuBriefcaseBusiness, LuPencil,
} from "react-icons/lu";
import { fetchUsers, createUser, deleteUser, updateUserRole, resetUserPassword, backfillContractorAccounts, type AppUser, updateUserPages, setUserEnabled } from "./actions";
import { APP_ROLES, type AppRole, ROLE_LABEL, ROLE_OPTION_LABEL } from "@/lib/roles";
import { ACCOUNT_PAGES, ACCOUNT_PAGE_GROUPS } from "@/lib/accountPages";

const INPUT = "w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500 transition-all";

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function initials(fullName: string, email: string) {
  const source = fullName.trim() || email.split("@")[0];
  const parts = source.split(/[\s.\-_]+/).filter(Boolean);
  return parts.slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("") || "U";
}

const AVATAR_COLORS = [
  "bg-teal-100 text-teal-700",
  "bg-blue-100 text-blue-700",
  "bg-purple-100 text-purple-700",
  "bg-orange-100 text-orange-700",
  "bg-pink-100 text-pink-700",
  "bg-emerald-100 text-emerald-700",
];

function avatarColor(id: string) {
  let n = 0;
  for (let i = 0; i < id.length; i++) n += id.charCodeAt(i);
  return AVATAR_COLORS[n % AVATAR_COLORS.length];
}

const ROLE_BADGE: Record<AppRole, { chip: string; tint: string; Icon: React.ElementType }> = {
  admin:   { chip: "bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100",     tint: "bg-purple-50 text-purple-600",   Icon: LuShieldCheck       },
  hr:      { chip: "bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100",         tint: "bg-amber-50 text-amber-600",     Icon: LuHeartHandshake    },
  manager: { chip: "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100", tint: "bg-emerald-50 text-emerald-600", Icon: LuBriefcaseBusiness },
  user:    { chip: "bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100",             tint: "bg-blue-50 text-blue-600",       Icon: LuUser              },
};

function RoleIcon({ role, size }: { role: AppRole; size: number }) {
  const { Icon } = ROLE_BADGE[role];
  return <Icon size={size} />;
}

function RoleChip({ role }: { role: AppRole }) {
  const { chip, Icon } = ROLE_BADGE[role];
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border transition-colors ${chip}`}>
      <Icon size={11} /> {ROLE_LABEL[role]}
    </span>
  );
}

function StatCard({ label, value, Icon, tint }: { label: string; value: number; Icon: React.ElementType; tint: string }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 flex items-center justify-between">
      <div>
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{label}</p>
        <p className="text-3xl font-black text-[#003527] mt-1">{value}</p>
      </div>
      <div className={`size-10 rounded-xl flex items-center justify-center shrink-0 ${tint}`}>
        <Icon size={20} />
      </div>
    </div>
  );
}

type Modal =
  | { type: "create" }
  | { type: "delete"; user: AppUser }
  | { type: "reset"; user: AppUser }
  | { type: "role"; user: AppUser; newRole: AppRole }
  | { type: "pages"; user: AppUser; pages: string[]; enabled: boolean }  // enabled = the account itself
  | null;

export function UsersView({ embedded }: { embedded?: boolean }) {
  const [users,         setUsers]         = useState<AppUser[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [error,         setError]         = useState("");
  const [modal,         setModal]         = useState<Modal>(null);
  const [isPending,     startTransition]  = useTransition();
  const [syncResult,    setSyncResult]    = useState<{ created: number; skipped: number } | null>(null);
  const [syncing,       setSyncing]       = useState(false);

  // Table filters
  const [searchTerm, setSearchTerm] = useState("");
  const [roleFilter, setRoleFilter] = useState<"All" | AppRole>("All");

  // Create form
  const [newEmail,    setNewEmail]    = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole,     setNewRole]     = useState<AppRole>("user");
  const [formError,   setFormError]   = useState("");

  // Reset password form
  const [resetPw,     setResetPw]     = useState("");
  const [resetError,  setResetError]  = useState("");

  async function load() {
    setLoading(true); setError("");
    try {
      setUsers(await fetchUsers());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load users.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function handleSync() {
    setSyncing(true); setSyncResult(null); setError("");
    try {
      const result = await backfillContractorAccounts();
      setSyncResult(result);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sync failed.");
    } finally {
      setSyncing(false);
    }
  }

  function closeModal() {
    setModal(null);
    setNewEmail(""); setNewPassword(""); setNewRole("user"); setFormError("");
    setResetPw(""); setResetError("");
  }

  function handleCreate() {
    if (!newEmail.trim()) { setFormError("Email is required."); return; }
    if (!newPassword || newPassword.length < 6) { setFormError("Password must be at least 6 characters."); return; }
    setFormError("");
    startTransition(async () => {
      try {
        const created = await createUser(newEmail.trim(), newPassword, newRole);
        setUsers((prev) => [created, ...prev]);
        closeModal();
      } catch (e) {
        setFormError(e instanceof Error ? e.message : "Failed to create user.");
      }
    });
  }

  function handleDelete(user: AppUser) {
    startTransition(async () => {
      try {
        await deleteUser(user.id);
        setUsers((prev) => prev.filter((u) => u.id !== user.id));
        closeModal();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to delete user.");
        closeModal();
      }
    });
  }

  function handleRolePick(user: AppUser) {
    setModal({ type: "role", user, newRole: user.role });
  }

  function handleConfirmRoleChange() {
    if (modal?.type !== "role") return;
    const { user, newRole } = modal;
    if (newRole === user.role) { closeModal(); return; }
    startTransition(async () => {
      try {
        await updateUserRole(user.id, newRole);
        setUsers((prev) => prev.map((u) => u.id === user.id ? { ...u, role: newRole } : u));
        closeModal();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to update role.");
        closeModal();
      }
    });
  }

  function handleSaveAccount(user: AppUser, pages: string[], enabled: boolean) {
    startTransition(async () => {
      try {
        await updateUserPages(user.id, pages);
        // Only touched when it actually changed, so a menu edit doesn't
        // re-ban or unban the account as a side effect.
        if (enabled !== user.enabled) await setUserEnabled(user.id, enabled);
        closeModal();
        // Re-read rather than patch locally, so the row shows exactly what
        // was stored on the account.
        await load();
      } catch {
        /* the modal stays open; the row is unchanged */
      }
    });
  }

  function handleResetPassword() {
    if (!resetPw || resetPw.length < 6) { setResetError("Password must be at least 6 characters."); return; }
    if (modal?.type !== "reset") return;
    setResetError("");
    startTransition(async () => {
      try {
        await resetUserPassword(modal.user.id, resetPw);
        closeModal();
      } catch (e) {
        setResetError(e instanceof Error ? e.message : "Failed to reset password.");
      }
    });
  }

  const countByRole = (role: AppRole) => users.filter((u) => u.role === role).length;

  // Sorted alphabetically by the name actually shown in the row, falling back to
  // the email for accounts with no name — otherwise nameless rows would sort
  // together at one end rather than alongside the names they display as.
  // localeCompare so accented names land where a reader expects.
  const filteredUsers = users
    .filter((u) =>
      (roleFilter === "All" || u.role === roleFilter) &&
      (u.fullName || u.email).toLowerCase().includes(searchTerm.trim().toLowerCase())
    )
    .sort((a, b) =>
      (a.fullName?.trim() || a.email).localeCompare(b.fullName?.trim() || b.email, undefined, { sensitivity: "base" })
    );

  return (
    <div className={embedded ? "max-w-full overflow-x-hidden" : "p-4 sm:p-6 md:p-8 max-w-full overflow-x-hidden"}>
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between mb-3 md:mb-4 gap-3">
        <div>
          {!embedded && (<>
          <nav className="flex mb-1">
            <ol className="flex items-center gap-1.5 text-xs text-slate-500 font-medium">
              <li>Management</li>
              <li><LuChevronRight size={14} className="text-slate-400" /></li>
              <li className="text-teal-600">User Management</li>
            </ol>
          </nav>
          <div className="flex items-center gap-3">
            <div className="hidden sm:grid size-9 shrink-0 place-items-center rounded-xl bg-[#003527] text-white shadow-sm">
              <LuUsers size={18} strokeWidth={2} />
            </div>
            <div>
              <h2 className="text-lg md:text-xl font-bold text-[#003527] tracking-tight">User Management</h2>
              <p className="text-xs md:text-sm text-slate-600 mt-0.5">Create accounts and set the role that decides what each person sees.</p>
            </div>
          </div>
          </>)}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={load}
            disabled={loading}
            className="p-2 text-slate-400 hover:text-[#003527] hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-40"
            title="Refresh"
          >
            <LuRefreshCw size={16} className={loading ? "animate-spin" : ""} />
          </button>
          <button
            onClick={handleSync}
            disabled={syncing}
            title="Create login accounts for all existing contractors who don't have one yet"
            className="inline-flex items-center justify-center gap-1.5 w-28 sm:w-36 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-xl transition-colors shadow-sm disabled:opacity-60"
          >
            {syncing ? <LuLoader size={14} className="animate-spin" /> : <LuUserCheck size={14} strokeWidth={2} />}
            <span className="hidden sm:inline">{syncing ? "Syncing…" : "Sync Contractors"}</span>
            <span className="sm:hidden">{syncing ? "…" : "Sync"}</span>
          </button>
          <button
            onClick={() => setModal({ type: "create" })}
            className="inline-flex items-center justify-center gap-1.5 w-28 sm:w-36 py-1.5 bg-[#003527] hover:bg-[#064e3b] text-white text-xs font-semibold rounded-xl transition-colors shadow-sm"
          >
            <LuPlus size={14} strokeWidth={2.5} />
            Add User
          </button>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
        <StatCard label="Total Users" value={users.length} Icon={LuUsers} tint="bg-teal-50 text-teal-600" />
        {APP_ROLES.map((role) => (
          <StatCard
            key={role}
            label={role === "user" ? "Contractors" : `${ROLE_LABEL[role]}s`}
            value={countByRole(role)}
            Icon={ROLE_BADGE[role].Icon}
            tint={ROLE_BADGE[role].tint}
          />
        ))}
      </div>

      {error && (
        <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 text-red-600 text-sm rounded-xl flex items-center gap-2">
          <LuCircleX size={15} /> {error}
        </div>
      )}

      {syncResult && (
        <div className="mb-4 px-4 py-3 bg-teal-50 border border-teal-200 text-teal-700 text-sm rounded-xl flex items-center gap-2">
          <LuCircleCheck size={15} />
          Sync complete — <strong>{syncResult.created}</strong> account{syncResult.created !== 1 ? "s" : ""} created, <strong>{syncResult.skipped}</strong> already existed.
          <button onClick={() => setSyncResult(null)} className="ml-auto text-teal-500 hover:text-teal-700">
            <LuX size={14} />
          </button>
        </div>
      )}

      {/* Filters */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 flex flex-wrap gap-3 items-center mb-4">
        <span className="text-sm font-semibold text-slate-500 mr-1">Filters:</span>
        <div className="relative">
          <LuSearch size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search name..."
            className="text-sm border border-slate-200 rounded-lg pl-8 pr-3 py-1.5 bg-slate-50 text-slate-700 focus:outline-none focus:ring-2 focus:ring-teal-500 w-56"
          />
        </div>
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value as "All" | AppRole)}
          className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 bg-slate-50 text-slate-700 focus:outline-none focus:ring-2 focus:ring-teal-500 cursor-pointer"
        >
          <option value="All">All Roles</option>
          {APP_ROLES.map((role) => (
            <option key={role} value={role}>{ROLE_LABEL[role]}</option>
          ))}
        </select>
        {(searchTerm !== "" || roleFilter !== "All") && (
          <button
            onClick={() => { setSearchTerm(""); setRoleFilter("All"); }}
            className="text-sm font-semibold text-teal-600 hover:text-teal-700"
          >
            Clear
          </button>
        )}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left" style={{ borderCollapse: "separate", borderSpacing: 0 }}>
            <thead>
              <tr style={{ background: "#003527" }}>
                {["Full Name", "Email", "Role", "Email Confirmed", "Created", "Last Sign In", "Actions"].map((h) => (
                  <th key={h} className="px-5 py-3.5 text-xs font-semibold text-white uppercase tracking-wider whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td className="px-5 py-4"><div className="flex items-center gap-3"><div className="size-8 rounded-full bg-slate-100" /><div className="h-3 bg-slate-100 rounded w-36" /></div></td>
                    {[1,2,3,4,5,6].map((j) => <td key={j} className="px-5 py-4"><div className="h-3 bg-slate-100 rounded w-20" /></td>)}
                  </tr>
                ))
              ) : filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-16 text-center text-sm text-slate-400">
                    <LuUsers size={28} className="mx-auto mb-2 text-slate-200" strokeWidth={1.5} />
                    {users.length === 0 ? "No users found." : "No users match your search or filter."}
                  </td>
                </tr>
              ) : filteredUsers.map((user) => (
                <tr key={user.id} className="hover:bg-slate-50 transition-colors group">
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      <div className={`size-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${avatarColor(user.id)}`}>
                        {initials(user.fullName, user.email)}
                      </div>
                      <span className="text-sm font-semibold text-slate-700 truncate max-w-xs">{user.fullName || "—"}</span>
                    </div>
                  </td>
                  <td className="px-5 py-4 text-sm text-slate-500 truncate max-w-xs">{user.email}</td>
                  <td className="px-5 py-4">
                    <button
                      onClick={() => handleRolePick(user)}
                      disabled={isPending}
                      title="Click to change role"
                      className="cursor-pointer disabled:opacity-50"
                    >
                      <RoleChip role={user.role} />
                    </button>
                  </td>
                  <td className="px-5 py-4">
                    {user.confirmed ? (
                      <span className="inline-flex items-center gap-1 text-xs text-emerald-600 font-medium">
                        <LuCircleCheck size={13} /> Confirmed
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs text-amber-500 font-medium">
                        <LuCircleX size={13} /> Pending
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-4 text-sm text-slate-500 whitespace-nowrap">{fmtDate(user.createdAt)}</td>
                  <td className="px-5 py-4 text-sm text-slate-500 whitespace-nowrap">{fmtDate(user.lastSignIn)}</td>
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-2">
                      <button
                          onClick={() => setModal({ type: "pages", user, pages: user.pages, enabled: user.enabled })}
                          title="Edit the pages this account can open"
                          className="p-1.5 text-slate-300 hover:text-[#003527] hover:bg-slate-100 rounded-lg transition-colors"
                        >
                          <LuPencil size={15} strokeWidth={2} />
                        </button>
                      <button
                        onClick={() => setModal({ type: "reset", user })}
                        title="Reset password"
                        className="p-1.5 text-slate-300 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                      >
                        <LuKey size={15} strokeWidth={2} />
                      </button>
                      <button
                        onClick={() => setModal({ type: "delete", user })}
                        title="Delete user"
                        className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                      >
                        <LuTrash2 size={15} strokeWidth={2} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-5 py-3 bg-slate-50 border-t border-slate-200">
          <p className="text-xs text-slate-400 font-medium">
            {filteredUsers.length === users.length ? `${users.length} total accounts` : `${filteredUsers.length} of ${users.length} accounts`}
          </p>
        </div>
      </div>

      {/* ── Create User Modal ── */}
      {modal?.type === "create" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={closeModal} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="size-9 rounded-xl bg-[#003527] text-white grid place-items-center">
                  <LuPlus size={17} strokeWidth={2} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-[#003527]">Add User</h3>
                  <p className="text-xs text-slate-400">Create a new portal account</p>
                </div>
              </div>
              <button onClick={closeModal} className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors">
                <LuX size={18} />
              </button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Email</label>
                <input className={INPUT} type="email" placeholder="user@company.com" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Password</label>
                <input className={INPUT} type="password" placeholder="Min. 6 characters" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Role</label>
                <select className={INPUT + " cursor-pointer"} value={newRole} onChange={(e) => setNewRole(e.target.value as AppRole)}>
                  {APP_ROLES.map((role) => (
                    <option key={role} value={role}>{ROLE_OPTION_LABEL[role]}</option>
                  ))}
                </select>
              </div>
              {formError && <p className="text-xs text-red-500">{formError}</p>}
            </div>
            <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-3 bg-slate-50 rounded-b-2xl">
              <button onClick={closeModal} className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-200 rounded-lg transition-colors">Cancel</button>
              <button
                onClick={handleCreate}
                disabled={isPending}
                className="px-5 py-2 bg-[#003527] hover:bg-[#064e3b] text-white text-sm font-semibold rounded-lg transition-colors shadow-sm flex items-center gap-2 disabled:opacity-60"
              >
                {isPending ? <LuLoader size={15} className="animate-spin" /> : <LuUsers size={15} />}
                {isPending ? "Creating…" : "Create User"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Confirm Modal ── */}
      {modal?.type === "delete" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={closeModal} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="px-6 py-5">
              <div className="size-12 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
                <LuTrash2 size={22} className="text-red-500" />
              </div>
              <h3 className="text-base font-bold text-slate-800 text-center">Delete User?</h3>
              <p className="text-sm text-slate-500 text-center mt-1">
                <span className="font-semibold text-slate-700">{modal.user.email}</span> will be permanently removed and cannot sign in.
              </p>
            </div>
            <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-3 bg-slate-50 rounded-b-2xl">
              <button onClick={closeModal} className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-200 rounded-lg transition-colors">Cancel</button>
              <button
                onClick={() => handleDelete(modal.user)}
                disabled={isPending}
                className="px-5 py-2 bg-red-500 hover:bg-red-600 text-white text-sm font-semibold rounded-lg transition-colors flex items-center gap-2 disabled:opacity-60"
              >
                {isPending ? <LuLoader size={15} className="animate-spin" /> : <LuTrash2 size={15} />}
                {isPending ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Role Change Confirm Modal ── */}
      {modal?.type === "pages" && (() => {
        const personalOnly = modal.user.role === "user" || modal.user.role === "manager";
        const visibleGroups = personalOnly
          ? ACCOUNT_PAGE_GROUPS.filter((g) => g === "Personal Pages")
          : ACCOUNT_PAGE_GROUPS;
        return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => !isPending && setModal(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100">
              <h3 className="text-base font-bold text-[#003527]">Menus for this account</h3>
              <p className="text-xs text-slate-400 mt-0.5 truncate">
                {modal.user.fullName || modal.user.email}
              </p>
            </div>
            <div className="px-6 py-4">
              {/* Whether the account works at all. Disabling bans it in
                  GoTrue, so sign-in is refused and any live session stops
                  being honoured. */}
              <div className={`flex items-start gap-3 rounded-xl border px-4 py-3 mb-4 ${
                modal.enabled ? "border-slate-200 bg-slate-50/60" : "border-red-200 bg-red-50"
              }`}>
                <button
                  type="button"
                  role="switch"
                  aria-checked={modal.enabled}
                  onClick={() => setModal({ ...modal, enabled: !modal.enabled })}
                  className={`mt-0.5 relative h-5 w-9 shrink-0 rounded-full transition-colors ${
                    modal.enabled ? "bg-[#003527]" : "bg-red-500"
                  }`}
                >
                  <span
                    className={`absolute top-0.5 size-4 rounded-full bg-white shadow transition-all ${
                      modal.enabled ? "left-[1.125rem]" : "left-0.5"
                    }`}
                  />
                </button>
                <div className="min-w-0">
                  <p className={`text-sm font-semibold ${modal.enabled ? "text-[#003527]" : "text-red-700"}`}>
                    Account {modal.enabled ? "enabled" : "disabled"}
                  </p>
                  <p className={`text-[11px] mt-0.5 ${modal.enabled ? "text-slate-500" : "text-red-600"}`}>
                    {modal.enabled
                      ? "This account can sign in and use the system."
                      : "Disabled — sign-in is refused and any signed-in session stops working."}
                  </p>
                </div>
              </div>

              <p className="text-xs text-slate-500 mb-3">
                {personalOnly
                  ? modal.user.role === "manager"
                    ? "Ticked pages are added to this manager's sidebar. Their Dashboard and Time Away Request come from their role and are always available."
                    : "Only ticked pages appear in this contractor's portal. Their Dashboard is always available."
                  : "Ticked menus are what this account sees. Untouched accounts follow their role's defaults; saving here replaces that with exactly these."}
                {modal.user.pagesAreDefault && (
                  <span className="block mt-1 text-[11px] text-slate-400">
                    Currently on the {ROLE_LABEL[modal.user.role]} defaults.
                  </span>
                )}
              </p>
              <div className="space-y-4 max-h-[22rem] overflow-y-auto pr-1">
                {visibleGroups.map((group) => (
                  <div key={group}>
                    <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400 mb-1.5">{group}</p>
                    <div className="space-y-1">
                      {ACCOUNT_PAGES.filter((p) => p.group === group).map((page) => {
                        const on = modal.pages.includes(page.key);
                        return (
                          <label
                            key={page.key}
                            className="flex items-center gap-3 px-3 py-2 rounded-lg border border-slate-200 hover:bg-slate-50 cursor-pointer transition-colors"
                          >
                            <input
                              type="checkbox"
                              checked={on}
                              onChange={(e) => setModal({
                                ...modal,
                                pages: e.target.checked
                                  ? [...modal.pages, page.key]
                                  : modal.pages.filter((k) => k !== page.key),
                              })}
                              className="size-4 accent-[#003527] cursor-pointer"
                            />
                            <span className="text-sm font-medium text-slate-700">{page.label}</span>
                            <span className="ml-auto text-[11px] text-slate-300 font-mono truncate">{page.href}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-3">
              <button
                onClick={() => setModal(null)}
                disabled={isPending}
                className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-200 rounded-lg transition-colors disabled:opacity-40"
              >
                Cancel
              </button>
              <button
                onClick={() => handleSaveAccount(modal.user, modal.pages, modal.enabled)}
                disabled={isPending}
                className="px-5 py-2 bg-[#003527] hover:bg-[#064e3b] text-white text-sm font-semibold rounded-lg transition-colors shadow-sm flex items-center gap-2 disabled:opacity-60"
              >
                {isPending ? <LuLoader size={15} className="animate-spin" /> : <LuPencil size={15} strokeWidth={2} />}
                {isPending ? "Saving…" : "Save Changes"}
              </button>
            </div>
          </div>
        </div>
        );
      })()}

      {modal?.type === "role" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={closeModal} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="px-6 py-5">
              <div className={`size-12 rounded-full flex items-center justify-center mx-auto mb-4 ${ROLE_BADGE[modal.newRole].tint}`}>
                <RoleIcon role={modal.newRole} size={22} />
              </div>
              <h3 className="text-base font-bold text-slate-800 text-center">Change Role?</h3>
              <p className="text-sm text-slate-500 text-center mt-1">
                <span className="font-semibold text-slate-700">{modal.user.email}</span> is currently{" "}
                <span className="font-semibold text-slate-700">{ROLE_LABEL[modal.user.role]}</span>. Pick the role
                they should have — it decides which menus they see when they sign in.
              </p>
              <div className="space-y-1 mt-4">
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Role</label>
                <select
                  className={INPUT + " cursor-pointer"}
                  value={modal.newRole}
                  onChange={(e) => setModal({ ...modal, newRole: e.target.value as AppRole })}
                >
                  {APP_ROLES.map((role) => (
                    <option key={role} value={role}>{ROLE_OPTION_LABEL[role]}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-3 bg-slate-50 rounded-b-2xl">
              <button onClick={closeModal} className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-200 rounded-lg transition-colors">Cancel</button>
              <button
                onClick={handleConfirmRoleChange}
                disabled={isPending || modal.newRole === modal.user.role}
                className="px-5 py-2 bg-[#003527] hover:bg-[#064e3b] text-white text-sm font-semibold rounded-lg transition-colors flex items-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {isPending
                  ? <LuLoader size={15} className="animate-spin" />
                  : <RoleIcon role={modal.newRole} size={15} />}
                {isPending ? "Updating…" : "Change Role"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Reset Password Modal ── */}
      {modal?.type === "reset" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={closeModal} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="size-9 rounded-xl bg-blue-600 text-white grid place-items-center">
                  <LuKey size={17} strokeWidth={2} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-800">Reset Password</h3>
                  <p className="text-xs text-slate-400 truncate max-w-[180px]">{modal.user.email}</p>
                </div>
              </div>
              <button onClick={closeModal} className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors">
                <LuX size={18} />
              </button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">New Password</label>
                <input className={INPUT} type="password" placeholder="Min. 6 characters" value={resetPw} onChange={(e) => setResetPw(e.target.value)} />
              </div>
              {resetError && <p className="text-xs text-red-500">{resetError}</p>}
            </div>
            <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-3 bg-slate-50 rounded-b-2xl">
              <button onClick={closeModal} className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-200 rounded-lg transition-colors">Cancel</button>
              <button
                onClick={handleResetPassword}
                disabled={isPending}
                className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition-colors flex items-center gap-2 disabled:opacity-60"
              >
                {isPending ? <LuLoader size={15} className="animate-spin" /> : <LuKey size={15} />}
                {isPending ? "Saving…" : "Reset Password"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
