/**
 * Shared limits for the Attendance Report.
 *
 * A plain module rather than a const in actions.ts: a "use server" file may
 * only export async functions, so exporting a number from it fails the build
 * outright. Both the action and the card that states the limit read it here.
 */

/** A guard on the fan-out: contractors x weeks x 7 day cells are produced. */
export const MAX_REPORT_WEEKS = 26;
