import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

// Salary-at-rest encryption. Every money figure (contract rates, payroll
// adjustments, processed payroll amounts) is stored as an AES-256-GCM
// ciphertext string prefixed with `enc:v1:` — the prefix lets decrypt tell a
// legacy plaintext value ("5200", 12.5, "—") apart from an encrypted one, so
// the migration can be gradual: reads accept both, writes always encrypt.
//
// The single master key lives ONLY in the SALARY_MASTER_KEY env var (64 hex
// chars = 32 bytes). Losing it makes every encrypted figure unrecoverable, so
// it must be backed up outside the database and the repo.
//
// Server-only: `node:crypto` is unavailable in the browser, and the key must
// never reach the client. Import this from server actions / route handlers.

const PREFIX = "enc:v1:";
// Plaintext is padded to a multiple of this before encrypting so the
// ciphertext length doesn't leak how many digits a salary has.
const PAD_BLOCK = 32;

let cachedKey: Buffer | null = null;

export function hasSalaryKey(): boolean {
  return Boolean(process.env.SALARY_MASTER_KEY?.trim());
}

function loadKey(): Buffer {
  if (cachedKey) return cachedKey;
  const raw = process.env.SALARY_MASTER_KEY?.trim();
  if (!raw) {
    throw new Error("SALARY_MASTER_KEY is not set — salary data cannot be encrypted or decrypted.");
  }
  const buf = /^[0-9a-fA-F]{64}$/.test(raw) ? Buffer.from(raw, "hex") : Buffer.from(raw, "base64");
  if (buf.length !== 32) {
    throw new Error("SALARY_MASTER_KEY must be 32 bytes: 64 hex characters (or 44 base64 characters).");
  }
  cachedKey = buf;
  return buf;
}

export function isSalaryEncrypted(value: unknown): boolean {
  return typeof value === "string" && value.startsWith(PREFIX);
}

/** Encrypts an arbitrary string. Already-encrypted input is returned as-is. */
export function encryptSalary(plain: string): string {
  if (isSalaryEncrypted(plain)) return plain;
  const key = loadKey();
  const iv = randomBytes(12);
  const padLen = PAD_BLOCK - (Buffer.byteLength(plain, "utf8") % PAD_BLOCK);
  const padded = plain + " ".repeat(padLen); // always ≥1 space so trimEnd is lossless
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(padded, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString("base64")}:${tag.toString("base64")}:${ct.toString("base64")}`;
}

/**
 * Decrypts a stored value. Legacy plaintext (no prefix) is returned unchanged
 * so rows that pre-date encryption keep working until they're backfilled.
 */
export function decryptSalary(value: unknown): string {
  if (value == null) return "";
  const str = String(value);
  if (!str.startsWith(PREFIX)) return str;
  const [ivB64, tagB64, ctB64] = str.slice(PREFIX.length).split(":");
  if (!ivB64 || !tagB64 || !ctB64) throw new Error("Malformed encrypted salary value.");
  const key = loadKey();
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  const plain = Buffer.concat([decipher.update(Buffer.from(ctB64, "base64")), decipher.final()]).toString("utf8");
  return plain.replace(/ +$/, "");
}

/** Numbers are stored as their decimal string, encrypted. */
export function encryptSalaryNumber(n: number): string {
  return encryptSalary(String(Number.isFinite(n) ? n : 0));
}

/** Tolerates legacy numeric columns, plaintext strings, and ciphertext. */
export function decryptSalaryNumber(value: unknown): number {
  if (value == null || value === "") return 0;
  if (typeof value === "number") return value;
  const n = Number(decryptSalary(value));
  return Number.isFinite(n) ? n : 0;
}

/** Returns a shallow copy of `obj` with the listed numeric fields encrypted. */
export function encryptNumberFields<T extends Record<string, unknown>, K extends keyof T & string>(
  obj: T,
  keys: readonly K[],
): Record<K, string> {
  const out = {} as Record<K, string>;
  for (const k of keys) out[k] = encryptSalaryNumber(Number(obj[k] ?? 0));
  return out;
}

// ── OTP hashing ────────────────────────────────────────────────────────────
// One-time codes are never stored in clear: only an HMAC (keyed with the
// master key) of email+code, compared in constant time.

export function hashOtp(email: string, code: string): string {
  return createHmac("sha256", loadKey()).update(`${email.trim().toLowerCase()}:${code}`).digest("hex");
}

export function otpMatches(email: string, code: string, storedHash: string): boolean {
  const a = Buffer.from(hashOtp(email, code), "hex");
  const b = Buffer.from(storedHash, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}
