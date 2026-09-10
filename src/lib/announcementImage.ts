/**
 * Upload constraints for announcement images, shared by the server action that
 * enforces them and the form that documents them, so the two can't drift.
 *
 * Lives here rather than in announcements/actions.ts because that file is
 * "use server" — such a module may only export async functions, so a plain
 * const export from it fails at runtime.
 */
export const ANNOUNCEMENT_IMAGE = {
  bucket: "announcement-images",
  maxBytes: 1 * 1024 * 1024,
  formats: ["image/png", "image/jpeg", "image/webp"],
  formatLabel: "PNG, JPG or WebP",
  maxLabel: "1 MB",
  recommended: "600 x 600 px (square)",
  minimum: "300 x 300 px",
} as const;
