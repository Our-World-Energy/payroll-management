"use client";

import { useEffect, useState, useTransition } from "react";
import {
  LuUsers, LuPlus, LuTrash2, LuX, LuLoader, LuShieldCheck, LuUser,
  LuChevronRight, LuRefreshCw, LuKey, LuCircleCheck, LuCircleX, LuUserCheck, LuSearch,
  LuHeartHandshake, LuBriefcaseBusiness, LuPencil, LuBan, LuUserX,
} from "react-icons/lu";
import { fetchUsers, createUser, deleteUser, updateUserRole, resetUserPassword, backfillContractorAccounts, type AppUser, type ContractorStatus, updateUserPages, setUserEnabled, setUsersEnabled, mayAssignAdminRole } from "./actions";
import { APP_ROLES, type AppRole, ROLE_LABEL, ROLE_OPTION_LABEL, ADMIN_ROLE_GRANTER_EMAIL } from "@/lib/roles";
import { ACCOUNT_PAGES, ACCOUNT_PAGE_GROUPS } from "@/lib/accountPages";

const INPUT = "w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500 transition-all";

// Full Name and Email stay put while the rest of the table scrolls sideways.
// Email's sticky offset is Full Name's width, so the two must agree — keep
// left-[220px] in step with FROZEN_NAME_W if either changes.
const FROZEN_NAME_W  = "w-[220px] min-w-[220px]";
const FROZEN_EMAIL_W = "w-[240px] min-w-[240px]";

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

// Whether the account can sign in at all. A disabled account is banned in
// GoTrue, so this is the state of the login itself, not of the custom menus
// that share the same dialog.
function StatusChip({ enabled }: { enabled: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border whitespace-nowrap ${
      enabled
        ? "bg-emerald-50 text-emerald-700 border-emerald-200"
        : "bg-red-50 text-red-600 border-red-200"
    }`}>
      {enabled ? <LuCircleCheck size={11} /> : <LuBan size={11} />}
      {enabled ? "Enabled" : "Disabled"}
    </span>
  );
}

// The engagement status from Contractor Details. An account with no
// contractor record — an admin-only login — gets a dash rather than a chip,
// since "not on file" is not the same as being dismissed.
function ContractorStatusChip({ status }: { status: ContractorStatus | null }) {
  if (status === null) return <span className="text-sm text-slate-300">—</span>;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border whitespace-nowrap ${
      status === "Active"
        ? "bg-emerald-50 text-emerald-700 border-emerald-200"
        : "bg-slate-100 text-slate-500 border-slate-200"
    }`}>
      {status === "Active" ? <LuCircleCheck size={11} /> : <LuUserX size={11} />}
      {status}
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

/**
 * Enabled and Disabled in one card rather than two: they are two halves of the
 * same total, so reading them side by side is the point — and a lone "Disabled:
 * 0" card would take a slot to say nothing.
 *
 * The disabled figure turns red only when there is something to see; zero stays
 * grey, so an all-enabled workspace doesn't read as a problem.
 */
function AccountStatusCard({ enabled, disabled }: { enabled: number; disabled: number }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Account Status</p>
        <div className="mt-1 flex items-baseline gap-4">
          <span>
            <span className="text-2xl font-black text-[#003527]">{enabled}</span>
            <span className="ml-1.5 text-[10px] font-bold uppercase tracking-wide text-emerald-600">Enabled</span>
          </span>
          <span>
            <span className={`text-2xl font-black ${disabled > 0 ? "text-red-600" : "text-slate-300"}`}>{disabled}</span>
            <span className={`ml-1.5 text-[10px] font-bold uppercase tracking-wide ${disabled > 0 ? "text-red-500" : "text-slate-400"}`}>Disabled</span>
          </span>
        </div>
      </div>
      <div className="size-10 rounded-xl flex items-center justify-center shrink-0 bg-slate-100 text-slate-500">
        <LuUserCheck size={20} />
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
  // Which rows the bulk enable/disable applies to. Ids rather than indexes, so
  // a filter change or a reload can't silently re-point a selection at
  // different accounts.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState<"enable" | "disable" | null>(null);
  const [bulkResult, setBulkResult] = useState("");

  // Whether this admin may hand out the admin role — only one account can (see
  // ADMIN_ROLE_GRANTER_EMAIL). Starts false so the option is never briefly
  // offered to someone who cannot use it; the action refuses it regardless.
  const [canGrantAdmin, setCanGrantAdmin] = useState(false);

  const [searchTerm, setSearchTerm] = useState("");
  const [roleFilter, setRoleFilter] = useState<"All" | AppRole>("All");
  const [statusFilter, setStatusFilter] = useState<"All" | "Enabled" | "Disabled">("All");
  // "None" covers accounts with no contractor record — the dash in the column.
  const [contractorFilter, setContractorFilter] =
    useState<"All" | ContractorStatus | "None">("All");
  const [departmentFilter, setDepartmentFilter] = useState("All");
  const [countryFilter,    setCountryFilter]    = useState("All");

  // Create form
  const [newName,     setNewName]     = useState("");
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
  useEffect(() => { mayAssignAdminRole().then(setCanGrantAdmin).catch(() => setCanGrantAdmin(false)); }, []);

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
    setNewName(""); setNewEmail(""); setNewPassword(""); setNewRole("user"); setFormError("");
    setResetPw(""); setResetError("");
  }

  function handleCreate() {
    // Checked in the order the fields appear, so the message points at the
    // first thing the reader would look at.
    if (!newName.trim()) { setFormError("Name is required."); return; }
    if (!newEmail.trim()) { setFormError("Email is required."); return; }
    if (!newPassword || newPassword.length < 6) { setFormError("Password must be at least 6 characters."); return; }
    setFormError("");
    startTransition(async () => {
      try {
        const created = await createUser(newEmail.trim(), newPassword, newRole, newName);
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

  function toggleSelected(id: string) {
    setBulkResult("");
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  /**
   * Header checkbox. Scoped to the selectable rows currently shown, so "select
   * all" on a filtered list means those rows and not the other 300 — and
   * clearing it leaves any selection made under a different filter alone.
   * Admin rows are never included.
   */
  function toggleSelectAllVisible() {
    setBulkResult("");
    const visibleIds = selectableUsers.map((u) => u.id);
    const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id));
    setSelectedIds((current) => {
      const next = new Set(current);
      for (const id of visibleIds) {
        if (allVisibleSelected) next.delete(id); else next.add(id);
      }
      return next;
    });
  }

  function handleBulkEnabled(enabled: boolean) {
    // Only the accounts that would actually change, so enabling a mixed
    // selection doesn't re-ban or unban the ones already in that state — the
    // same rule the single-row save follows.
    const targets = users.filter((u) => selectedIds.has(u.id) && u.role !== "admin" && u.enabled !== enabled);
    if (targets.length === 0) {
      setBulkResult(`Nothing to do — every selected account is already ${enabled ? "enabled" : "disabled"}.`);
      return;
    }
    setBulkBusy(enabled ? "enable" : "disable");
    setBulkResult("");
    startTransition(async () => {
      try {
        const { updated, failed, skippedSelf, skippedAdmins } = await setUsersEnabled(targets.map((u) => u.id), enabled);
        const word = enabled ? "enabled" : "disabled";
        // Named explicitly: silently leaving an account untouched would read as
        // a bug to whoever selected it.
        const selfNote = skippedSelf ? " Your own account was left enabled." : "";
        const adminNote = skippedAdmins > 0
          ? ` ${skippedAdmins} admin account${skippedAdmins === 1 ? "" : "s"} skipped.`
          : "";
        setBulkResult(
          failed.length === 0
            ? `${updated} account${updated === 1 ? "" : "s"} ${word}.${adminNote}${selfNote}`
            // Says how far it got: the rest are already changed, so the reader
            // needs to know this was partial rather than a no-op.
            : `${updated} ${word}, ${failed.length} failed — ${failed[0].message}${adminNote}${selfNote}`
        );
        setSelectedIds(new Set());
        // Re-read rather than patch locally, so each row shows what was
        // actually stored on the account.
        await load();
      } catch (e) {
        setBulkResult(e instanceof Error ? e.message : "Bulk update failed.");
      } finally {
        setBulkBusy(null);
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
  const enabledCount  = users.filter((u) => u.enabled).length;
  const disabledCount = users.length - enabledCount;

  // Drawn from the accounts on file rather than a fixed list, so a new team or
  // country appears here as soon as one contractor carries it. Blanks are
  // dropped: an admin-only login has no team or country to offer.
  const departmentOptions = Array.from(new Set(users.map((u) => u.department).filter(Boolean))).sort();
  const countryOptions    = Array.from(new Set(users.map((u) => u.country).filter(Boolean))).sort();

  // Sorted alphabetically by the name actually shown in the row, falling back to
  // the email for accounts with no name — otherwise nameless rows would sort
  // together at one end rather than alongside the names they display as.
  // localeCompare so accented names land where a reader expects.
  const filteredUsers = users
    .filter((u) =>
      (roleFilter === "All" || u.role === roleFilter) &&
      (statusFilter === "All" || (statusFilter === "Enabled") === u.enabled) &&
      (contractorFilter === "All"
        || (contractorFilter === "None"
              ? u.contractorStatus === null
              : u.contractorStatus === contractorFilter)) &&
      (departmentFilter === "All" || u.department === departmentFilter) &&
      (countryFilter    === "All" || u.country    === countryFilter) &&
      (u.fullName || u.email).toLowerCase().includes(searchTerm.trim().toLowerCase())
    )
    .sort((a, b) =>
      (a.fullName?.trim() || a.email).localeCompare(b.fullName?.trim() || b.email, undefined, { sensitivity: "base" })
    );

  // Admin accounts are not bulk-selectable — see setUsersEnabled. Select-all
  // and the header's tick state both work off this list rather than every
  // shown row, so "all selected" means what the action will actually change.
  const selectableUsers = filteredUsers.filter((u) => u.role !== "admin");
  const allVisibleSelected = selectableUsers.length > 0 && selectableUsers.every((u) => selectedIds.has(u.id));
  const someVisibleSelected = selectableUsers.some((u) => selectedIds.has(u.id));

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
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
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
        <AccountStatusCard enabled={enabledCount} disabled={disabledCount} />
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
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as "All" | "Enabled" | "Disabled")}
          className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 bg-slate-50 text-slate-700 focus:outline-none focus:ring-2 focus:ring-teal-500 cursor-pointer"
        >
          <option value="All">All Statuses</option>
          <option value="Enabled">Enabled</option>
          <option value="Disabled">Disabled</option>
        </select>
        <select
          value={contractorFilter}
          onChange={(e) => setContractorFilter(e.target.value as "All" | ContractorStatus | "None")}
          className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 bg-slate-50 text-slate-700 focus:outline-none focus:ring-2 focus:ring-teal-500 cursor-pointer"
        >
          <option value="All">All Contractor Statuses</option>
          <option value="Active">Active</option>
          <option value="Dismissed">Dismissed</option>
          <option value="None">No contractor record</option>
        </select>
        <select
          value={departmentFilter}
          onChange={(e) => setDepartmentFilter(e.target.value)}
          className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 bg-slate-50 text-slate-700 focus:outline-none focus:ring-2 focus:ring-teal-500 cursor-pointer"
        >
          <option value="All">All Assigned Teams</option>
          {departmentOptions.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
        <select
          value={countryFilter}
          onChange={(e) => setCountryFilter(e.target.value)}
          className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 bg-slate-50 text-slate-700 focus:outline-none focus:ring-2 focus:ring-teal-500 cursor-pointer"
        >
          <option value="All">All Countries</option>
          {countryOptions.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        {(searchTerm !== "" || roleFilter !== "All" || statusFilter !== "All" || contractorFilter !== "All"
          || departmentFilter !== "All" || countryFilter !== "All") && (
          <button
            onClick={() => {
              setSearchTerm(""); setRoleFilter("All");
              setStatusFilter("All"); setContractorFilter("All");
              setDepartmentFilter("All"); setCountryFilter("All");
            }}
            className="text-sm font-semibold text-teal-600 hover:text-teal-700"
          >
            Clear
          </button>
        )}
      </div>

      {/* Bulk bar — only once something is selected, so it never takes up
          room while nobody is using it. */}
      {selectedIds.size > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-teal-200 bg-teal-50 px-4 py-2.5">
          <span className="text-sm font-semibold text-teal-800">
            {selectedIds.size} account{selectedIds.size === 1 ? "" : "s"} selected
          </span>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <button
              onClick={() => handleBulkEnabled(true)}
              disabled={bulkBusy !== null || isPending}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {bulkBusy === "enable" ? <LuLoader size={13} className="animate-spin" /> : <LuUserCheck size={13} strokeWidth={2} />}
              {bulkBusy === "enable" ? "Enabling…" : "Enable"}
            </button>
            <button
              onClick={() => handleBulkEnabled(false)}
              disabled={bulkBusy !== null || isPending}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-red-700 bg-white border border-red-200 rounded-lg hover:bg-red-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {bulkBusy === "disable" ? <LuLoader size={13} className="animate-spin" /> : <LuUserX size={13} strokeWidth={2} />}
              {bulkBusy === "disable" ? "Disabling…" : "Disable"}
            </button>
            <button
              onClick={() => { setSelectedIds(new Set()); setBulkResult(""); }}
              disabled={bulkBusy !== null}
              className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:text-slate-800 disabled:opacity-50"
            >
              Clear selection
            </button>
          </div>
        </div>
      )}
      {bulkResult && (
        <p className="mb-3 text-xs font-medium text-slate-500">{bulkResult}</p>
      )}

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {/* Height-capped like Weekly Payroll, so the horizontal scrollbar
            sits at the bottom of this box — on screen — rather than at the
            end of a 350-row page that has to be scrolled to reach it. Rows
            scroll vertically inside here, under a sticky header.
            overflow-x-scroll keeps the horizontal bar present even on a
            monitor wide enough that 1420px doesn't overflow; vertical stays
            automatic so a short list gets no pointless empty track. */}
        <div className="overflow-x-scroll overflow-y-auto max-h-[72vh] md:max-h-[60vh]">
          {/* minWidth keeps the nine columns at their natural size instead of
              letting w-full squeeze them to fit — that overflow is what makes
              the container scroll sideways and the frozen pair worth having. */}
          <table className="w-full text-left" style={{ minWidth: "1420px", borderCollapse: "separate", borderSpacing: 0 }}>
            <thead className="sticky top-0 z-30">
              <tr style={{ background: "#003527" }}>
                {["Full Name", "Email", "Role", "Status", "Contractor Status", "Email Confirmed", "Created", "Last Sign In", "Actions"].map((h) => (
                  <th
                    key={h}
                    className={`px-5 py-3.5 text-xs font-semibold text-white uppercase tracking-wider whitespace-nowrap bg-[#003527] ${
                      h === "Full Name"
                        ? `sticky left-0 z-20 ${FROZEN_NAME_W} bg-[#003527] shadow-[1px_0_0_0_#0a4435]`
                        : h === "Email"
                        ? `sticky left-[220px] z-20 ${FROZEN_EMAIL_W} bg-[#003527] shadow-[1px_0_0_0_#0a4435]`
                        : ""
                    }`}
                  >
                    {h === "Full Name" ? (
                      <span className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={allVisibleSelected}
                          ref={(el) => { if (el) el.indeterminate = someVisibleSelected && !allVisibleSelected; }}
                          onChange={toggleSelectAllVisible}
                          disabled={loading || selectableUsers.length === 0}
                          aria-label="Select all shown accounts"
                          title="Select all shown accounts. Admin accounts are excluded."
                          className="size-3.5 shrink-0 cursor-pointer accent-teal-600 disabled:cursor-not-allowed"
                        />
                        {h}
                      </span>
                    ) : h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td className={`sticky left-0 z-10 ${FROZEN_NAME_W} px-5 py-4 bg-white shadow-[1px_0_0_0_#e2e8f0]`}><div className="flex items-center gap-3"><div className="size-8 rounded-full bg-slate-100" /><div className="h-3 bg-slate-100 rounded w-36" /></div></td>
                    <td className={`sticky left-[220px] z-10 ${FROZEN_EMAIL_W} px-5 py-4 bg-white shadow-[1px_0_0_0_#e2e8f0]`}><div className="h-3 bg-slate-100 rounded w-32" /></td>
                    {[1,2,3,4,5,6,7].map((j) => <td key={j} className="px-5 py-4"><div className="h-3 bg-slate-100 rounded w-20" /></td>)}
                  </tr>
                ))
              ) : filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-5 py-16 text-center text-sm text-slate-400">
                    <LuUsers size={28} className="mx-auto mb-2 text-slate-200" strokeWidth={1.5} />
                    {users.length === 0 ? "No users found." : "No users match your search or filter."}
                  </td>
                </tr>
              ) : filteredUsers.map((user) => (
                <tr key={user.id} className="hover:bg-slate-50 transition-colors group">
                  <td className={`sticky left-0 z-10 ${FROZEN_NAME_W} px-5 py-4 bg-white group-hover:bg-slate-50 transition-colors shadow-[1px_0_0_0_#e2e8f0]`}>
                    <div className="flex items-center gap-3">
                      {/* Admins are not bulk-selectable. A disabled checkbox
                          rather than a blank, so the column stays aligned and
                          the reason is available on hover. */}
                      <input
                        type="checkbox"
                        checked={user.role !== "admin" && selectedIds.has(user.id)}
                        onChange={() => toggleSelected(user.id)}
                        disabled={bulkBusy !== null || user.role === "admin"}
                        aria-label={user.role === "admin"
                          ? `${user.fullName || user.email} — admin accounts cannot be changed in bulk`
                          : `Select ${user.fullName || user.email}`}
                        title={user.role === "admin" ? "Admin accounts cannot be enabled or disabled in bulk" : undefined}
                        className="size-3.5 shrink-0 cursor-pointer accent-teal-600 disabled:cursor-not-allowed disabled:opacity-40"
                      />
                      <div className={`size-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${avatarColor(user.id)}`}>
                        {initials(user.fullName, user.email)}
                      </div>
                      <span className="text-sm font-semibold text-slate-700 truncate">{user.fullName || "—"}</span>
                    </div>
                  </td>
                  <td className={`sticky left-[220px] z-10 ${FROZEN_EMAIL_W} px-5 py-4 text-sm text-slate-500 bg-white group-hover:bg-slate-50 transition-colors shadow-[1px_0_0_0_#e2e8f0]`}>
                    <span className="block truncate">{user.email}</span>
                  </td>
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
                    <StatusChip enabled={user.enabled} />
                  </td>
                  <td className="px-5 py-4">
                    <ContractorStatusChip status={user.contractorStatus} />
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
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Name</label>
                <input className={INPUT} type="text" placeholder="Full name" value={newName} onChange={(e) => setNewName(e.target.value)} />
              </div>
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
                  {APP_ROLES
                    .filter((role) => role !== "admin" || canGrantAdmin)
                    .map((role) => (
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
                  {APP_ROLES
                    .filter((role) => role !== "admin" || canGrantAdmin || modal.user.role === "admin")
                    .map((role) => (
                      <option key={role} value={role}>{ROLE_OPTION_LABEL[role]}</option>
                    ))}
                </select>
                {!canGrantAdmin && (
                  <p className="text-[11px] text-slate-400">
                    Only {ADMIN_ROLE_GRANTER_EMAIL} can assign the Admin role.
                  </p>
                )}
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
