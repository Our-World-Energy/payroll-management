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
  return Boolean(process.env.SENDGRID_API_KEY?.trim());
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
