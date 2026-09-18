"use client";

import PortalPage from "@/app/contractor/time-off/page";

/**
 * Time Away, rendered inside the admin console shell.
 *
 * The same component the Contractor Portal route renders — it reads its own
 * session, so it needs nothing from either layout. Mirrored here because a
 * console account following the /contractor route would land in the contractor
 * layout and watch its own menu be replaced by a contractor's; see
 * PORTAL_PAGES.consoleHref.
 *
 * The padding matches the console's other pages, which each supply their own
 * (the admin layout has none).
 */
export default function ConsolePortalPage() {
  return (
    <div className="p-4 sm:p-5 md:p-6 max-w-full overflow-x-hidden">
      <PortalPage />
    </div>
  );
}
