"use client";

import { TimeOffView } from "../time-off/TimeOffView";
import { useAccount } from "@/components/RoleContext";
import { useContractorConfig } from "@/components/ContractorConfigContext";

/**
 * Time Away Request — the Time Away Management view in read-only mode: same
 * balances, filters, search and CSV export, without Process Time Away, the
 * PTO / SICK Used Import, or the per-row Action column. Rendering the same
 * component rather than a copy keeps the two views from drifting apart.
 *
 * A manager sees only their own contractors. The link runs through OWE
 * Contacts: the signed-in email is matched against org_managers.email to find
 * that contact's name, and contractor_profiles.manager holds the same name.
 * Admins and HR are not scoped.
 */
export default function TimeAwayRequestPage() {
  const { role, email } = useAccount();
  const { managers } = useContractorConfig();

  if (role !== "manager") return <TimeOffView readOnly />;

  const signedIn = email.trim().toLowerCase();
  const contact = signedIn
    ? managers.find((m) => m.email.trim().toLowerCase() === signedIn)
    : undefined;

  // No match resolves to null, never to undefined: until the OWE Contacts
  // list has loaded, `managers` is empty and every lookup misses, and an
  // unscoped view would show a manager every contractor in the company.
  // Erring towards an empty table is the safe direction here.
  return <TimeOffView readOnly assignedTo={contact?.name ?? null} />;
}
