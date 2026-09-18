// Transactional email via SendGrid. Configure with:
//   SENDGRID_API_KEY — from sendgrid.com → Settings → API Keys (needs mail.send)
//   MAIL_FROM        — a sender on a domain authenticated in SendGrid, either
//                      "OWE Payroll <team@ourworldenergy.com>" or a bare
//                      address. ourworldenergy.com is domain-authenticated, so
//                      any address on it is a valid sender.
//
// Called over the v3 REST API with plain fetch rather than @sendgrid/mail: the
// SDK pulls in Node built-ins, and this runs on Cloudflare Workers.

export type SendEmailResult = { ok: true; id?: string } | { ok: false; error: string; notConfigured?: boolean };

const ENDPOINT = "https://api.sendgrid.com/v3/mail/send";

export function isMailConfigured(): boolean {
  return Boolean(process.env.SENDGRID_API_KEY?.trim() && process.env.MAIL_FROM?.trim());
}

/** Absolute base for links and images in an email — relative URLs are useless there. */
export function appUrl(): string {
  return (process.env.APP_URL || "https://team.ourworldenergy.com").replace(/\/+$/, "");
}

/** Splits "Name <addr@host>" into SendGrid's shape; a bare address works too. */
function parseFrom(raw: string): { email: string; name?: string } {
  const m = raw.match(/^\s*(.*?)\s*<\s*([^>]+)\s*>\s*$/);
  if (m) return { email: m[2].trim(), name: m[1].replace(/^"|"$/g, "").trim() || undefined };
  return { email: raw.trim() };
}

export async function sendEmail(params: { to: string; subject: string; html: string; text: string }): Promise<SendEmailResult> {
  const apiKey = process.env.SENDGRID_API_KEY?.trim();
  if (!apiKey) return { ok: false, notConfigured: true, error: "Email is not configured (SENDGRID_API_KEY is missing)." };

  const rawFrom = process.env.MAIL_FROM?.trim();
  if (!rawFrom) return { ok: false, notConfigured: true, error: "Email is not configured (MAIL_FROM is missing)." };

  try {
    const response = await fetch(ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: params.to }] }],
        from: parseFrom(rawFrom),
        subject: params.subject,
        // Order matters to SendGrid: the last part is the preferred one, so
        // text/plain must come first for HTML to win in clients that take it.
        content: [
          { type: "text/plain", value: params.text },
          { type: "text/html", value: params.html },
        ],
      }),
    });

    // A successful send is 202 with an empty body; the id is in a header.
    if (response.status === 202) {
      return { ok: true, id: response.headers.get("x-message-id") ?? undefined };
    }

    // Failures carry { errors: [{ message, field }] }.
    const body = await response.text();
    let detail = body.slice(0, 300);
    try {
      const parsed = JSON.parse(body) as { errors?: Array<{ message?: string; field?: string }> };
      if (parsed.errors?.length) {
        detail = parsed.errors.map((e) => (e.field ? `${e.field}: ${e.message}` : e.message)).join("; ");
      }
    } catch {
      // Not JSON — fall back to the raw body above.
    }
    return { ok: false, error: `SendGrid ${response.status}: ${detail}` };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// ── Template building blocks ────────────────────────────────────────────────
// Everything below composes inline-styled, table-based HTML on purpose: email
// clients (Outlook especially) drop <style> blocks, flexbox and grid.

const FONT = "Inter,system-ui,-apple-system,'Segoe UI',Arial,sans-serif";

const C = {
  ink:    "#191c1e",
  deep:   "#003527",
  brand:  "#006b5f",
  pale:   "#e6f4f1",
  body:   "#404944",
  muted:  "#707974",
  rule:   "#e8ebe9",
  canvas: "#f4f6f5",
} as const;

/**
 * Escapes text before it goes into an HTML email. Every value that originates
 * from a user — a leave reason, a name — must pass through here: without it a
 * contractor's free-text reason could inject markup into their manager's inbox.
 */
function esc(raw: string): string {
  return raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/**
 * Formats a "YYYY-MM-DD" key as "Tue, 22 Sep 2026".
 *
 * Built from the string's own parts rather than `toLocaleDateString`, so the
 * result never shifts by a day depending on the server's timezone — these keys
 * are calendar dates, not instants, and Workers runs in UTC while a local dev
 * machine does not.
 */
export function formatEmailDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!m) return iso;
  const [, y, mo, d] = m;
  const weekday = WEEKDAYS[new Date(Date.UTC(+y, +mo - 1, +d)).getUTCDay()];
  return `${weekday}, ${+d} ${MONTHS[+mo - 1]} ${y}`;
}

/** "Tue, 22 Sep 2026" for one day, or "22 – 24 Sep 2026" collapsed where it can be. */
export function formatEmailDateRange(start: string, end: string): string {
  if (!end || start === end) return formatEmailDate(start);
  const a = /^(\d{4})-(\d{2})-(\d{2})$/.exec(start.trim());
  const b = /^(\d{4})-(\d{2})-(\d{2})$/.exec(end.trim());
  if (!a || !b) return `${formatEmailDate(start)} – ${formatEmailDate(end)}`;
  // Same month and year reads better collapsed: "22 – 24 Sep 2026".
  if (a[1] === b[1] && a[2] === b[2]) return `${+a[3]} – ${+b[3]} ${MONTHS[+a[2] - 1]} ${a[1]}`;
  if (a[1] === b[1]) return `${+a[3]} ${MONTHS[+a[2] - 1]} – ${+b[3]} ${MONTHS[+b[2] - 1]} ${a[1]}`;
  return `${+a[3]} ${MONTHS[+a[2] - 1]} ${a[1]} – ${+b[3]} ${MONTHS[+b[2] - 1]} ${b[1]}`;
}

/** Label/value rows. Pairs with an empty value are dropped rather than shown blank. */
function detailTable(rows: Array<[string, string]>): string {
  const cells = rows
    .filter(([, value]) => value.trim() !== "")
    .map(
      ([label, value], i) => `
        <tr>
          <td style="padding:${i === 0 ? "0" : "11px"} 16px 11px 0;border-top:${i === 0 ? "none" : `1px solid ${C.rule}`};font-family:${FONT};font-size:12px;line-height:1.5;color:${C.muted};white-space:nowrap;vertical-align:top">${esc(label)}</td>
          <td style="padding:${i === 0 ? "0" : "11px"} 0 11px;border-top:${i === 0 ? "none" : `1px solid ${C.rule}`};font-family:${FONT};font-size:13px;line-height:1.5;color:${C.ink};font-weight:600;vertical-align:top">${esc(value)}</td>
        </tr>`,
    )
    .join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse">${cells}</table>`;
}

/** A CTA that still renders as a button in Outlook, where padding on <a> is ignored. */
function button(href: string, label: string): string {
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0">
      <tr>
        <td align="center" bgcolor="${C.brand}" style="border-radius:10px">
          <a href="${href}" style="display:inline-block;padding:13px 28px;font-family:${FONT};font-size:14px;font-weight:700;line-height:1;color:#ffffff;text-decoration:none">${esc(label)}</a>
        </td>
      </tr>
    </table>`;
}

/**
 * The outer chrome every OWE email shares: canvas, logo, card, footer. Keeping
 * it in one place is what stops the templates drifting apart visually.
 */
function shell(opts: { preheader: string; eyebrow: string; heading: string; body: string; footer: string }): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<title>${esc(opts.heading)}</title>
</head>
<body style="margin:0;padding:0;background:${C.canvas};-webkit-font-smoothing:antialiased">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(opts.preheader)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.canvas}">
    <tr>
      <td align="center" style="padding:32px 16px">
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:560px">
          <tr>
            <td style="padding:0 4px 18px">
              <img src="${appUrl()}/email-logo.png" alt="OWE" width="104" style="display:block;width:104px;max-width:104px;height:auto;border:0">
            </td>
          </tr>
          <tr>
            <td bgcolor="#ffffff" style="padding:32px 28px;border-radius:14px;border:1px solid ${C.rule}">
              <p style="margin:0 0 10px;font-family:${FONT};font-size:11px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:${C.brand}">${esc(opts.eyebrow)}</p>
              <h1 style="margin:0 0 14px;font-family:${FONT};font-size:21px;line-height:1.3;font-weight:700;color:${C.deep}">${esc(opts.heading)}</h1>
              ${opts.body}
            </td>
          </tr>
          <tr>
            <td style="padding:18px 8px 0;font-family:${FONT};font-size:11px;line-height:1.6;color:${C.muted}">
              ${opts.footer}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// ── Time away request → manager ─────────────────────────────────────────────

export type TimeOffRequestEmailParams = {
  managerName:     string;
  contractorName:  string;
  contractorEmail: string;
  department:      string;
  location:        string;
  leaveType:       string;  // "PTO" | "PTO Half Day" | "Sick Leave" | "Sick Leave Half Day"
  startDate:       string;  // "YYYY-MM-DD"
  endDate:         string;  // "YYYY-MM-DD"
  dayCount:        number;  // calendar days the submission covers
  totalHours:      number;  // hours being drawn down across those days
  reason:          string;
  reviewUrl:       string;
};

/**
 * Sent to the one manager named on the contractor's profile when a Time Away
 * request is filed — never to the whole OWE Contacts list.
 */
export function timeOffRequestEmail(p: TimeOffRequestEmailParams) {
  const dateLabel = formatEmailDateRange(p.startDate, p.endDate);
  const firstName = p.managerName.trim().split(/\s+/)[0] || "there";
  const duration = p.dayCount === 1
    ? `1 day · ${p.totalHours}h`
    : `${p.dayCount} days · ${p.totalHours}h`;

  const subject = `Time away request — ${p.contractorName} (${dateLabel})`;

  const text = [
    `Hi ${firstName},`,
    "",
    `${p.contractorName} has filed a time away request that needs your review.`,
    "",
    `Contractor:  ${p.contractorName} (${p.contractorEmail})`,
    // null, not "" — an absent department is dropped below, while the ""
    // entries above and after it are deliberate blank lines that must survive.
    p.department ? `Department:  ${p.department}` : null,
    p.location ? `Location:    ${p.location}` : null,
    `Type:        ${p.leaveType}`,
    `Dates:       ${dateLabel}`,
    `Duration:    ${duration}`,
    "",
    "Reason:",
    p.reason.trim() || "(none given)",
    "",
    `Review it here: ${p.reviewUrl}`,
    "",
    "— OWE Payroll",
    "You are receiving this because you are the manager on this contractor's profile.",
  ]
    .filter((line): line is string => line !== null)
    .join("\n");

  const body = `
      <p style="margin:0 0 18px;font-family:${FONT};font-size:14px;line-height:1.6;color:${C.body}">
        Hi ${esc(firstName)}, <strong style="color:${C.ink}">${esc(p.contractorName)}</strong> has filed a time away
        request that needs your review.
      </p>

      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px">
        <tr>
          <td bgcolor="${C.pale}" style="padding:16px 18px;border-radius:10px">
            <p style="margin:0 0 4px;font-family:${FONT};font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:${C.brand}">${esc(p.leaveType)}</p>
            <p style="margin:0;font-family:${FONT};font-size:17px;font-weight:700;line-height:1.35;color:${C.deep}">${esc(dateLabel)}</p>
            <p style="margin:4px 0 0;font-family:${FONT};font-size:12px;line-height:1.5;color:${C.body}">${esc(duration)}</p>
          </td>
        </tr>
      </table>

      ${detailTable([
        ["Contractor", p.contractorName],
        ["Email", p.contractorEmail],
        ["Department", p.department],
        ["Location", p.location],
        ["Request type", p.leaveType],
        ["Dates", dateLabel],
        ["Duration", duration],
      ])}

      <p style="margin:22px 0 6px;font-family:${FONT};font-size:12px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:${C.muted}">Reason given</p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 26px">
        <tr>
          <td style="padding:12px 16px;border-left:3px solid ${C.brand};background:#fafbfb;font-family:${FONT};font-size:13px;line-height:1.6;color:${C.body}">
            ${esc(p.reason.trim()) || `<span style="color:${C.muted}">No reason given.</span>`}
          </td>
        </tr>
      </table>

      ${button(p.reviewUrl, "Review request")}

      <p style="margin:18px 0 0;font-family:${FONT};font-size:12px;line-height:1.6;color:${C.muted}">
        The request stays <strong style="color:${C.body}">Pending</strong> until it is approved or declined in the portal.
      </p>`;

  const html = shell({
    preheader: `${p.contractorName} · ${p.leaveType} · ${dateLabel}`,
    eyebrow: "OWE Payroll",
    heading: "Time away request",
    body,
    footer: `You are receiving this because you are listed as the manager on ${esc(p.contractorName)}&#39;s contractor profile.
             Replies to this address are not monitored.`,
  });

  return { subject, text, html };
}

export function salaryOtpEmail(code: string, minutes: number, grantDays: number) {
  const subject = `${code} is your salary access code`;
  const text = [
    `Your one-time code to unlock salary data in the OWE Payroll admin is: ${code}`,
    "",
    `It expires in ${minutes} minutes. If you didn't request this, you can ignore this email — nothing is unlocked until the code is entered.`,
  ].join("\n");
  const html = `
    <div style="font-family:Inter,system-ui,-apple-system,Segoe UI,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;color:#191c1e">
      <p style="margin:0 0 8px;font-size:11px;font-weight:700;letter-spacing:.18em;text-transform:uppercase;color:#006b5f">OWE Payroll</p>
      <h1 style="margin:0 0 16px;font-size:20px;color:#003527">Salary access verification</h1>
      <p style="margin:0 0 20px;font-size:14px;line-height:1.5;color:#404944">
        Enter this code in the admin portal to unlock salary and payment figures for the next ${grantDays} days.
      </p>
      <div style="display:inline-block;padding:14px 22px;border-radius:12px;background:#e6f4f1;color:#003527;font-size:30px;font-weight:700;letter-spacing:.35em;font-variant-numeric:tabular-nums">${code}</div>
      <p style="margin:20px 0 0;font-size:12px;line-height:1.5;color:#707974">
        The code expires in ${minutes} minutes. If you didn't request it, ignore this email — nothing is unlocked until the code is entered.
      </p>
    </div>`;
  return { subject, text, html };
}
