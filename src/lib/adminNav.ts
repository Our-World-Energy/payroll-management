import {
  LuLayoutDashboard, LuHardHat, LuFingerprint, LuWallet,
  LuCalendarX, LuChartBar, LuSettings, LuUsers, LuClipboardList,
} from "react-icons/lu";
import type { IconType } from "react-icons";
import { type AppRole, usesAdminConsole } from "./roles";

export type NavItem = { href: string; label: string; Icon: IconType; roles: AppRole[] };

// Which console roles see each menu. HR gets Dashboard, Contractor Details,
// Time Away Management and Attendance Tracker; Manager gets Dashboard plus
// Time Away Management (where they approve requests). Everything else stays
// admin-only.
const CONSOLE: AppRole[] = ["admin", "hr", "manager"];
const ADMIN_HR: AppRole[] = ["admin", "hr"];
const ADMIN: AppRole[] = ["admin"];

export const NAV_ITEMS: NavItem[] = [
  { href: "/admin",              label: "Dashboard",          Icon: LuLayoutDashboard, roles: CONSOLE  },
  { href: "/admin/contractors",  label: "Contractor Details", Icon: LuHardHat,         roles: ADMIN_HR },
  { href: "/admin/time-off",     label: "Time Away Management",Icon: LuCalendarX,      roles: CONSOLE  },
  { href: "/admin/attendance",   label: "Attendance",         Icon: LuFingerprint,     roles: ADMIN    },
  { href: "/admin/payroll",      label: "Payroll",            Icon: LuWallet,          roles: ADMIN    },
  { href: "/admin/attendance-tracker", label: "Attendance Tracker", Icon: LuClipboardList, roles: ADMIN_HR },
  { href: "/admin/reports",      label: "Reports",            Icon: LuChartBar,        roles: ADMIN    },
  { href: "/admin/users",        label: "User Management",    Icon: LuUsers,           roles: ADMIN    },
  { href: "/admin/settings",     label: "Settings",           Icon: LuSettings,        roles: ADMIN    },
];

export function navItemsForRole(role: AppRole): NavItem[] {
  return NAV_ITEMS.filter((item) => item.roles.includes(role));
}

// Matches a nav item's own route and its sub-routes (so /admin/time-off/[id]
// still lights Time Away Management), but only on a path-segment boundary. A
// bare startsWith made "/admin/attendance-tracker" match "/admin/attendance"
// too, highlighting both items at once. Trailing slashes are normalised away
// because next.config sets trailingSlash: true.
export function matchesPath(pathname: string, href: string): boolean {
  const path = pathname.replace(/\/+$/, "") || "/";
  const target = href.replace(/\/+$/, "") || "/";
  if (target === "/admin") return path === "/admin";
  return path === target || path.startsWith(`${target}/`);
}

/**
 * Whether a role may open a path inside the /admin console. Admins get
 * everything, including the pages with no sidebar entry (/admin/holidays,
 * /admin/salary-access, /admin/announcements); every other console role is
 * held to its own menu.
 */
export function canAccessAdminPath(role: AppRole, pathname: string): boolean {
  if (role === "admin") return true;
  if (!usesAdminConsole(role)) return false;
  return navItemsForRole(role).some((item) => matchesPath(pathname, item.href));
}
