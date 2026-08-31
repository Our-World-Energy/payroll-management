import {
  LuLayoutDashboard, LuHardHat, LuFingerprint, LuWallet,
  LuCalendarX, LuChartBar, LuSettings, LuUsers, LuClipboardList,
} from "react-icons/lu";
import type { IconType } from "react-icons";

export type NavItem = { href: string; label: string; Icon: IconType };

export const NAV_ITEMS: NavItem[] = [
  { href: "/admin",              label: "Dashboard",          Icon: LuLayoutDashboard },
  { href: "/admin/contractors",  label: "Contractor Details", Icon: LuHardHat         },
  { href: "/admin/time-off",     label: "Time Away Management",Icon: LuCalendarX       },
  { href: "/admin/attendance",   label: "Attendance",         Icon: LuFingerprint     },
  { href: "/admin/payroll",      label: "Payroll",            Icon: LuWallet          },
  { href: "/admin/attendance-tracker", label: "Attendance Tracker", Icon: LuClipboardList },
  { href: "/admin/reports",      label: "Reports",            Icon: LuChartBar        },
  { href: "/admin/users",        label: "User Management",    Icon: LuUsers           },
  { href: "/admin/settings",     label: "Settings",           Icon: LuSettings        },
];
