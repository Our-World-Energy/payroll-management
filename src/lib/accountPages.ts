import { NAV_ITEMS, navItemsForRole, type NavItem } from "./adminNav";
import { PORTAL_PAGES, type AppRole, effectivePagesFor } from "./roles";

/**
 * Every menu an account can be given, for the tick boxes on User Management.
 *
 * Two families, keyed differently for a reason:
 *   • Admin console pages are keyed by their href ("/admin/payroll"). There is
 *     no shorter stable name, and the href is what the guard checks anyway.
 *   • The four personal pages keep their short keys ("profile", …) so grants
 *     already stored against manager accounts stay valid.
 */
export type AccountPage = { key: string; label: string; href: string; group: string };

export const ACCOUNT_PAGES: AccountPage[] = [
  ...NAV_ITEMS.map((item): AccountPage => ({
    key: item.href,
    label: item.label,
    href: item.href,
    group: "Admin Console",
  })),
  ...PORTAL_PAGES.map((page): AccountPage => ({
    key: page.key,
    label: page.label,
    href: page.href,
    group: "Personal Pages",
  })),
];

export const ACCOUNT_PAGE_GROUPS = ["Admin Console", "Personal Pages"] as const;

const ACCOUNT_PAGE_KEYS = ACCOUNT_PAGES.map((p) => p.key);

/** Whatever is stored on the account, reduced to keys this app recognises. */
export function normalizeAccountPages(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((v) => String(v)).filter((v) => ACCOUNT_PAGE_KEYS.includes(v));
}

/**
 * What the tick boxes should show for an account that has never been edited —
 * the role's own defaults, so opening the dialog reflects reality rather than
 * an empty list.
 */
export function defaultAccountPages(role: AppRole): string[] {
  return [
    ...navItemsForRole(role).map((i: NavItem) => i.href),
    ...effectivePagesFor(role, undefined),
  ];
}

/** True when this account has never had its pages set. */
export function accountPagesAreDefault(raw: unknown): boolean {
  return !Array.isArray(raw);
}

/**
 * The admin-console menu for an account: the role's own menu when nothing has
 * been set, otherwise exactly what was ticked.
 *
 * A ticked page is a grant, not a filter — an admin composing a menu here can
 * hand an account a page its role wouldn't normally include. That is the point
 * of the dialog, but it does mean the tick boxes, not the role, decide.
 */
export function accountNavItems(role: AppRole, raw: unknown): NavItem[] {
  if (!Array.isArray(raw)) return navItemsForRole(role);

  // Only console keys can override the console menu. A list holding just
  // personal-page keys leaves it alone — that covers lists saved before the
  // console menus were selectable, and the case where an admin ticks only
  // personal pages.
  const consoleKeys = normalizeAccountPages(raw).filter((k) => k.startsWith("/admin"));
  if (consoleKeys.length === 0) return navItemsForRole(role);

  const items = NAV_ITEMS.filter((item) => consoleKeys.includes(item.href));
  // Never strand a console account with nothing to open — that locks them out
  // of the very page an admin would use to put it back.
  return items.length > 0 ? items : navItemsForRole(role);
}

/** Whether an account may open a path inside the admin console. */
export function accountCanAccessAdminPath(role: AppRole, raw: unknown, pathname: string): boolean {
  const path = pathname.replace(/\/+$/, "") || "/";
  return accountNavItems(role, raw).some(
    (item) => path === item.href || path.startsWith(`${item.href}/`),
  );
}
