/**
 * Application roles.
 *
 * The role lives on the Supabase account as `user_metadata.role`; every part
 * of the app reads it through this module rather than poking at the metadata.
 *
 *   admin   — the whole /admin console
 *   hr      — /admin console, HR menus only
 *   manager — /admin console, dashboard + time away approvals
 *   user    — the /contractor portal
 */
export type AppRole = "admin" | "hr" | "manager" | "user";

export const APP_ROLES: AppRole[] = ["admin", "hr", "manager", "user"];

/**
 * Accounts created before roles existed carry no `role` in their metadata, and
 * the app has always read a missing (or unrecognised) role as an admin — keep
 * that default here so those accounts don't lose the console.
 */
export function normalizeRole(raw: unknown): AppRole {
  return APP_ROLES.includes(raw as AppRole) ? (raw as AppRole) : "admin";
}

/** Roles that live in the /admin console. Contractors get /contractor. */
export function usesAdminConsole(role: AppRole): boolean {
  return role !== "user";
}

/** Where a role lands after login, and where it gets bounced back to. */
export function homeForRole(role: AppRole): string {
  return role === "user" ? "/contractor/dashboard" : "/admin";
}

/** Short badge text. */
export const ROLE_LABEL: Record<AppRole, string> = {
  admin:   "Admin",
  hr:      "HR",
  manager: "Manager",
  user:    "Contractor",
};

/** Sub-heading under the logo in the sidebar. */
export const CONSOLE_LABEL: Record<AppRole, string> = {
  admin:   "Admin Console",
  hr:      "HR Console",
  manager: "Manager Portal",
  user:    "Contractor Portal",
};

/** Line under the account name in the topbar. */
export const ROLE_TITLE: Record<AppRole, string> = {
  admin:   "System Administrator",
  hr:      "Human Resources",
  manager: "Manager",
  user:    "Contractor",
};

/** Wording for the role dropdowns on User Management. */
export const ROLE_OPTION_LABEL: Record<AppRole, string> = {
  admin:   "Admin — full console access",
  hr:      "HR — contractors, time away, attendance tracker",
  manager: "Manager — dashboard and time away approvals",
  user:    "Contractor — contractor portal only",
};
