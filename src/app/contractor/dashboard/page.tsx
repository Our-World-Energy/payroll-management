"use client";

import { DashboardView } from "./DashboardView";

export default function ContractorDashboardPage() {
  // Empty eyebrow: no "Contractor Portal" line above the greeting. The Manager
  // Portal still passes CONSOLE_LABEL, so its own label is unaffected.
  return <DashboardView eyebrow="" />;
}
