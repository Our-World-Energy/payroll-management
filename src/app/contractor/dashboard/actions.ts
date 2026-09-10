"use server";

import { fetchContractorProfileByEmail, fetchCurrentMonthBirthdays, type ContractorProfile, type BirthdayEntry } from "../profile/actions";
import { fetchHolidays, type Holiday } from "@/app/admin/holidays/actions";
import { fetchAnnouncements, type Announcement } from "@/app/admin/announcements/actions";

export type DashboardBundle = {
  profile: ContractorProfile | null;
  holidays: Holiday[];
  announcements: Announcement[];
  birthdays: BirthdayEntry[];
};

/**
 * Everything the Dashboard needs, in one call.
 *
 * The four fetches used to be four separate Server Actions wrapped in a
 * client-side Promise.all — but Next serialises Server Action requests from a
 * client, so they ran one after another (four round trips, each carrying the
 * page payload) rather than concurrently. Doing the Promise.all here means one
 * round trip and genuine parallelism, since it's plain async work on the
 * server. Individually the queries are ~150-270ms; it was the round trips that
 * made the page feel slow.
 */
export async function fetchDashboardBundle(email: string): Promise<DashboardBundle> {
  const [profile, holidays, announcements, birthdays] = await Promise.all([
    fetchContractorProfileByEmail(email),
    fetchHolidays(),
    fetchAnnouncements(),
    fetchCurrentMonthBirthdays(),
  ]);
  return { profile, holidays, announcements, birthdays };
}
