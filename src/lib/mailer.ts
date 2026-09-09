import { Resend } from "resend";

// Transactional email via Resend (the package was already a dependency but
// unused). Configure with:
//   RESEND_API_KEY   — from resend.com → API Keys
//   MAIL_FROM        — a sender on a domain verified in Resend, e.g.
//                      "OWE Payroll <payroll@ourworldenergy.com>". The default
//                      onboarding@resend.dev sender only delivers to the Resend
//                      account owner's own inbox, so it's fine for a first
//                      local test but not for real users.

export type SendEmailResult = { ok: true; id?: string } | { ok: false; error: string; notConfigured?: boolean };

export function isMailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY?.trim());
}

export async function sendEmail(params: { to: string; subject: string; html: string; text: string }): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) return { ok: false, notConfigured: true, error: "Email is not configured (RESEND_API_KEY is missing)." };

  const from = process.env.MAIL_FROM?.trim() || "OWE Payroll <onboarding@resend.dev>";
  try {
    const resend = new Resend(apiKey);
    const { data, error } = await resend.emails.send({ from, to: params.to, subject: params.subject, html: params.html, text: params.text });
    if (error) return { ok: false, error: error.message };
    return { ok: true, id: data?.id };
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
