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

// ── Per-account page access ─────────────────────────────────────────────────
// The four personal pages under /contractor, controlled per account from User
// Management and stored as `user_metadata.pages` next to the role.
//
// The default differs by role, which is what `effectivePagesFor` is for:
//   • Contractor — sees all four unless a list has been set, so the 410
//     existing accounts are unaffected until someone edits them.
//   • Manager    — sees none unless granted; these are an addition to their
//     own console rather than the whole portal.
// A contractor's Dashboard and a manager's Dashboard / Time Away Request are
// always available and aren't part of this.
export const PORTAL_PAGES = [
  { key: "profile",      label: "Profile",      href: "/contractor/profile" },
  { key: "time-off",     label: "Time Away",    href: "/contractor/time-off" },
  { key: "attendance",   label: "Attendance",   href: "/contractor/attendance" },
  { key: "pay-vouchers", label: "Pay Vouchers", href: "/contractor/pay-vouchers" },
] as const;

export type PortalPageKey = (typeof PORTAL_PAGES)[number]["key"];

const PORTAL_PAGE_KEYS = PORTAL_PAGES.map((p) => p.key) as readonly string[];

/** Whatever is on the account, reduced to keys this app recognises. */
export function normalizePages(raw: unknown): PortalPageKey[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((v) => String(v))
    .filter((v): v is PortalPageKey => PORTAL_PAGE_KEYS.includes(v));
}

/** Whether a granted page covers this path (the page itself or below it). */
export function pageGrantsPath(pages: PortalPageKey[], pathname: string): boolean {
  const path = pathname.replace(/\/+$/, "") || "/";
  return PORTAL_PAGES.some(
    (p) => pages.includes(p.key) && (path === p.href || path.startsWith(`${p.href}/`)),
  );
}

/**
 * What this account may actually open. `raw` is user_metadata.pages.
 *
 * The distinction between "no list set" and "an empty list" matters: unset is
 * the pre-existing state of every contractor account, and must keep meaning
 * all four pages. An explicitly empty list means exactly that — none.
 */
export function effectivePagesFor(role: AppRole, raw: unknown): PortalPageKey[] {
  if (Array.isArray(raw)) return normalizePages(raw);
  return role === "user" ? PORTAL_PAGES.map((p) => p.key) : [];
}

/** True when this account has never had its pages set. */
export function pagesAreDefault(raw: unknown): boolean {
  return !Array.isArray(raw);
}
