// Emails a Time Away request to the ONE manager named on the requesting
// contractor's profile — never to the whole OWE Contacts list.
//
// The link between the two is by name, not by id: contractor_profiles.manager
// holds an OWE Contact's name, and org_managers.name is unique and carries the
// address to send to. That is the same join the Time Away Request page uses to
// scope a manager to their own contractors (src/app/admin/time-off-request).

import { createClient } from "@supabase/supabase-js";
import { sendEmail, isMailConfigured, timeOffRequestEmail, appUrl } from "./mailer";

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

/** Where the manager lands to act on the request. */
const REVIEW_PATH = "/admin/time-off-request/";

type Sb = ReturnType<typeof getSupabase>;

type Resolved = {
  managerName:    string;
  managerEmail:   string;
  contractorName: string;
  department:     string;
  location:       string;
};

type Resolution = { ok: true; to: Resolved } | { ok: false; reason: string };

type Contact = { name: string; email: string | null };

/** Case-insensitive, word-order-insensitive key: "Warnock Colten" → "colten warnock". */
function nameKey(raw: string): string {
  return raw.trim().toLowerCase().split(/\s+/).filter(Boolean).sort().join(" ");
}

/**
 * Finds the OWE Contact a profile's `manager` string refers to.
 *
 * Exact name first. Failing that, a case- and word-order-insensitive match,
 * because the same manager is spelled both ways across contractor profiles —
 * "Colten Warnock" on some and "Warnock Colten" on others — and both mean one
 * person. Without the fallback the reversed spellings notify nobody.
 *
 * The fallback refuses an ambiguous key rather than guessing: if two different
 * contacts reduce to the same words, picking one could email the wrong manager
 * a contractor's leave reason, which is worse than not sending.
 */
function matchContact(contacts: Contact[], managerName: string): Contact | null {
  const wanted = managerName.trim();
  const exact = contacts.find((c) => c.name.trim() === wanted);
  if (exact) return exact;

  const key = nameKey(wanted);
  if (!key) return null;
  const loose = contacts.filter((c) => nameKey(c.name) === key);
  return loose.length === 1 ? loose[0] : null;
}

/**
 * Finds the single manager to notify for `email`.
 *
 * Every miss is a distinct, named reason rather than a bare null: when a
 * request goes unnotified an admin needs to know whether the profile has no
 * manager, the manager is not an OWE Contact, or the contact has no address —
 * the three are fixed in different places in Settings.
 */
async function resolveManager(sb: Sb, email: string): Promise<Resolution> {
  const { data: profile, error } = await sb
    .from("contractor_profiles")
    .select("fullName, firstName, surname, manager, department, location")
    .eq("email", email)
    .maybeSingle();

  if (error) return { ok: false, reason: `could not read the contractor profile (${error.message})` };
  if (!profile) return { ok: false, reason: `no contractor profile exists for ${email}` };

  const contractorName =
    String(profile.fullName ?? "").trim() ||
    [profile.firstName, profile.surname].map((p) => String(p ?? "").trim()).filter(Boolean).join(" ") ||
    email;

  const managerName = String(profile.manager ?? "").trim();
  if (!managerName) {
    return { ok: false, reason: `${contractorName} has no manager set on their contractor profile` };
  }

  const { data: contacts, error: contactError } = await sb
    .from("org_managers")
    .select("name, email");

  if (contactError) return { ok: false, reason: `could not read OWE Contacts (${contactError.message})` };

  const contact = matchContact(contacts ?? [], managerName);
  if (!contact) {
    return { ok: false, reason: `"${managerName}" is not in Settings → OWE Contacts` };
  }
  if (contact.name.trim() !== managerName) {
    // Resolved through a fallback, so the two spellings disagree. Worth a line
    // in the log: the email still goes out, but the profile wants cleaning up.
    console.info(
      `notifyManagerOfTimeOffRequest: matched manager "${managerName}" to OWE Contact "${contact.name}" — ` +
      `consider aligning the spelling on ${contractorName}'s profile`,
    );
  }

  const managerEmail = String(contact.email ?? "").trim();
  if (!managerEmail || !managerEmail.includes("@")) {
    return { ok: false, reason: `OWE Contact "${managerName}" has no email address in Settings` };
  }

  return {
    ok: true,
    to: {
      managerName,
      managerEmail,
      contractorName,
      department: String(profile.department ?? "").trim(),
      location: String(profile.location ?? "").trim(),
    },
  };
}

export type NotifyResult =
  | { sent: true; to: string }
  | { sent: false; reason: string };

/**
 * Notifies the requesting contractor's manager that a Time Away request is
 * waiting on them. One email per submission, not one per day: filing 22nd–24th
 * writes three rows (see submitLeaveRequest) but the manager gets a single mail
 * covering the range.
 *
 * Never throws and never reports failure to the contractor — the request is
 * already committed by the time this runs, and a mail outage must not look like
 * a failed submission. Failures are logged for an admin to pick up instead.
 */
export async function notifyManagerOfTimeOffRequest(params: {
  email:      string;   // the requesting contractor
  leaveType:  string;
  startDate:  string;   // "YYYY-MM-DD"
  endDate:    string;   // "YYYY-MM-DD" — same as startDate for a single day
  dayCount:   number;
  totalHours: number;
  reason:     string;
}): Promise<NotifyResult> {
  try {
    if (!isMailConfigured()) {
      return { sent: false, reason: "email is not configured (SENDGRID_API_KEY / MAIL_FROM)" };
    }

    const resolution = await resolveManager(getSupabase(), params.email);
    if (!resolution.ok) return { sent: false, reason: resolution.reason };
    const to = resolution.to;

    const sent = await sendEmail({
      to: to.managerEmail,
      ...timeOffRequestEmail({
        managerName:     to.managerName,
        contractorName:  to.contractorName,
        contractorEmail: params.email,
        department:      to.department,
        location:        to.location,
        leaveType:       params.leaveType,
        startDate:       params.startDate,
        endDate:         params.endDate,
        dayCount:        params.dayCount,
        totalHours:      params.totalHours,
        reason:          params.reason,
        reviewUrl:       `${appUrl()}${REVIEW_PATH}`,
      }),
    });

    if (!sent.ok) return { sent: false, reason: sent.error };
    return { sent: true, to: to.managerEmail };
  } catch (err) {
    return { sent: false, reason: err instanceof Error ? err.message : String(err) };
  }
}
