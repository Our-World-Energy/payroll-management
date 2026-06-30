"use client";

import { useEffect, useState, useTransition } from "react";
import {
  LuUsers, LuPlus, LuTrash2, LuX, LuLoader, LuShieldCheck, LuUser,
  LuChevronRight, LuRefreshCw, LuKey, LuCircleCheck, LuCircleX, LuUserCheck,
} from "react-icons/lu";
import {
  fetchUsers, createUser, deleteUser, updateUserRole, resetUserPassword,
  backfillContractorAccounts, type AppUser,
} from "./actions";

const INPUT = "w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500 transition-all";

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function initials(email: string) {
  const name = email.split("@")[0];
  const parts = name.split(/[.\-_]/);
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

type Modal =
  | { type: "create" }
  | { type: "delete"; user: AppUser }
  | { type: "reset"; user: AppUser }
  | null;

export default function UserManagementPage() {
  const [users,         setUsers]         = useState<AppUser[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [error,         setError]         = useState("");
  const [modal,         setModal]         = useState<Modal>(null);
  const [isPending,     startTransition]  = useTransition();
  const [syncResult,    setSyncResult]    = useState<{ created: number; skipped: number } | null>(null);
  const [syncing,       setSyncing]       = useState(false);

  // Create form
  const [newEmail,    setNewEmail]    = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole,     setNewRole]     = useState<"admin" | "user">("user");
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

  function handleRoleToggle(user: AppUser) {
    const newRole = user.role === "admin" ? "user" : "admin";
    startTransition(async () => {
      try {
        await updateUserRole(user.id, newRole);
        setUsers((prev) => prev.map((u) => u.id === user.id ? { ...u, role: newRole } : u));
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to update role.");
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

  const admins = users.filter((u) => u.role === "admin").length;
  const normalUsers = users.filter((u) => u.role === "user").length;

  return (
    <div className="p-6 md:p-8 max-w-full">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between mb-6 gap-4">
        <div>
          <nav className="flex mb-2">
            <ol className="flex items-center gap-1.5 text-xs text-slate-500 font-medium">
              <li>Management</li>
              <li><LuChevronRight size={14} className="text-slate-400" /></li>
              <li className="text-teal-600">User Management</li>
            </ol>
          </nav>
          <h2 className="text-3xl md:text-4xl font-bold text-[#003527] tracking-tight">User Management</h2>
          <p className="text-sm text-slate-500 mt-1">Create and manage admin and user accounts for portal access.</p>
        </div>
        <div className="flex items-center gap-2">
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
            className="inline-flex items-center gap-2 px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold rounded-xl transition-colors shadow-sm disabled:opacity-60"
          >
            {syncing ? <LuLoader size={15} className="animate-spin" /> : <LuUserCheck size={15} strokeWidth={2} />}
            {syncing ? "Syncing…" : "Sync Contractors"}
          </button>
          <button
            onClick={() => setModal({ type: "create" })}
            className="inline-flex items-center gap-2 px-4 py-2 bg-[#003527] hover:bg-[#064e3b] text-white text-sm font-semibold rounded-xl transition-colors shadow-sm"
          >
            <LuPlus size={16} strokeWidth={2.5} />
            Add User
          </button>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Total Users</p>
            <p className="text-3xl font-black text-[#003527] mt-1">{users.length}</p>
          </div>
          <div className="size-10 rounded-xl bg-teal-50 flex items-center justify-center">
            <LuUsers size={20} className="text-teal-600" />
          </div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Admins</p>
            <p className="text-3xl font-black text-[#003527] mt-1">{admins}</p>
          </div>
          <div className="size-10 rounded-xl bg-purple-50 flex items-center justify-center">
            <LuShieldCheck size={20} className="text-purple-600" />
          </div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Normal Users</p>
            <p className="text-3xl font-black text-[#003527] mt-1">{normalUsers}</p>
          </div>
          <div className="size-10 rounded-xl bg-blue-50 flex items-center justify-center">
            <LuUser size={20} className="text-blue-600" />
          </div>
        </div>
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

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left" style={{ borderCollapse: "separate", borderSpacing: 0 }}>
            <thead>
              <tr style={{ background: "#003527" }}>
                {["User", "Role", "Email Confirmed", "Created", "Last Sign In", "Actions"].map((h) => (
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
                    {[1,2,3,4,5].map((j) => <td key={j} className="px-5 py-4"><div className="h-3 bg-slate-100 rounded w-20" /></td>)}
                  </tr>
                ))
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-16 text-center text-sm text-slate-400">
                    <LuUsers size={28} className="mx-auto mb-2 text-slate-200" strokeWidth={1.5} />
                    No users found.
                  </td>
                </tr>
              ) : users.map((user) => (
                <tr key={user.id} className="hover:bg-slate-50 transition-colors group">
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      <div className={`size-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${avatarColor(user.id)}`}>
                        {initials(user.email)}
                      </div>
                      <span className="text-sm font-semibold text-slate-700 truncate max-w-xs">{user.email}</span>
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    <button
                      onClick={() => handleRoleToggle(user)}
                      disabled={isPending}
                      title="Click to toggle role"
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border transition-colors cursor-pointer disabled:opacity-50 ${
                        user.role === "admin"
                          ? "bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100"
                          : "bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100"
                      }`}
                    >
                      {user.role === "admin" ? <LuShieldCheck size={11} /> : <LuUser size={11} />}
                      {user.role === "admin" ? "Admin" : "Contractor"}
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
          <p className="text-xs text-slate-400 font-medium">{users.length} total accounts</p>
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
                <select className={INPUT + " cursor-pointer"} value={newRole} onChange={(e) => setNewRole(e.target.value as "admin" | "user")}>
                  <option value="user">Contractor — normal access</option>
                  <option value="admin">Admin — full access</option>
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
