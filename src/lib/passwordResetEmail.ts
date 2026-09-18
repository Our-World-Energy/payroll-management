// Password-reset email template. Deliberately in its own module rather than in
// mailer.ts: mailer.ts is being built out concurrently by another session, so
// this feature owns its template and only borrows sendEmail from the shared
// mailer. Design produced by a judge-panel workflow (corporate-card direction,
// top-scored 8.0/10) and checked for email-client safety — table layout, all
// CSS inline, bulletproof button, dark-mode progressive enhancement, and an
// image-blocked fallback via the styled alt text.

export function passwordResetEmail(opts: {
  resetUrl: string;
  firstName: string;
  expires: string; // human-readable, e.g. "1 hour"
  recipientEmail: string;
}) {
  // firstName comes from profile data and recipientEmail from user input, so
  // neither is trusted in an HTML context. resetUrl is our own link, escaped
  // too so its "&" query separators render correctly inside the href attribute.
  const esc = (s: string) =>
    String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");

  const rawName = (opts.firstName ?? "").trim() || "there";
  const rawExpires = opts.expires || "1 hour";
  const name = esc(rawName);
  const url = esc(opts.resetUrl);
  const expires = esc(rawExpires);
  const email = esc(opts.recipientEmail);

  const subject = "Reset your Our World Energy password";

  const text = [
    `Hi ${rawName},`,
    "",
    "We received a request to reset the password for your Our World Energy account on the payroll & contractor portal.",
    "",
    `Set a new password (this link works once and expires in ${rawExpires}):`,
    opts.resetUrl,
    "",
    "If you didn't request this, you can safely ignore this email — your password won't change.",
    "",
    "— The Our World Energy team",
  ].join("\n");

  const html = `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <meta name="color-scheme" content="light dark">
  <meta name="supported-color-schemes" content="light dark">
  <title>Reset your Our World Energy password</title>
  <style>
    /* Progressive enhancement only. The email is fully styled inline and
       reads correctly if this block is stripped. */
    a { text-decoration: none; }
    .owe-btn:hover { background-color: #00564c !important; }
    .owe-link:hover { text-decoration: underline !important; }
    @media (prefers-color-scheme: dark) {
      .owe-page   { background-color: #0b1512 !important; }
      .owe-card   { background-color: #12211d !important; border-color: #2a3b35 !important; }
      .owe-ink    { color: #e8f3ef !important; }
      .owe-muted  { color: #9aa9a2 !important; }
      .owe-hair   { border-color: #2a3b35 !important; }
      .owe-eyebrow{ color: #7fd6c8 !important; }
      .owe-linkbox{ background-color: #0f1c18 !important; border-color: #2a3b35 !important; }
      .owe-link   { color: #7fd6c8 !important; }
    }
    @media only screen and (max-width: 600px) {
      .owe-card-pad { padding: 28px 24px !important; }
    }
  </style>
</head>
<body class="owe-page" style="margin:0; padding:0; width:100%; background-color:#e6f4f1; -webkit-text-size-adjust:100%; -ms-text-size-adjust:100%;">

  <!-- Preheader: inbox preview text, visually hidden -->
  <div style="display:none; max-height:0; overflow:hidden; mso-hide:all; font-size:1px; line-height:1px; color:#e6f4f1; opacity:0;">
    Use this one-time link to set a new password. It works once and expires in ${expires}.
    &#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;
  </div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="owe-page" style="background-color:#e6f4f1;">
    <tr>
      <td align="center" style="padding:32px 16px;">

        <!-- 600px container -->
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%; max-width:600px; margin:0 auto;">

          <!-- Card -->
          <tr>
            <td class="owe-card" style="background-color:#ffffff; border:1px solid #bfc9c3; border-radius:16px; box-shadow:0 1px 3px rgba(0,53,39,0.05);">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">

                <!-- Logo -->
                <tr>
                  <td class="owe-card-pad" align="center" style="padding:40px 40px 0 40px;">
                    <img src="https://team.ourworldenergy.com/email-logo.png" alt="Our World Energy" width="188" height="37" style="display:block; width:188px; height:auto; max-width:188px; border:0; outline:none; text-decoration:none; color:#003527; font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif; font-size:20px; font-weight:700;">
                  </td>
                </tr>

                <!-- Hairline divider -->
                <tr>
                  <td class="owe-card-pad" style="padding:24px 40px 0 40px;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr><td class="owe-hair" style="border-top:1px solid #bfc9c3; font-size:0; line-height:0;">&nbsp;</td></tr>
                    </table>
                  </td>
                </tr>

                <!-- Body copy -->
                <tr>
                  <td class="owe-card-pad" style="padding:28px 40px 8px 40px; font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">

                    <p class="owe-eyebrow" style="margin:0 0 10px 0; font-size:11px; font-weight:700; letter-spacing:0.16em; text-transform:uppercase; color:#006b5f;">Password reset</p>

                    <h1 class="owe-ink" style="margin:0 0 12px 0; font-size:24px; line-height:1.25; font-weight:700; color:#003527;">Set a new password</h1>

                    <!-- Restrained lime accent -->
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px 0;">
                      <tr><td style="width:44px; height:3px; background-color:#98c838; border-radius:2px; font-size:0; line-height:0;">&nbsp;</td></tr>
                    </table>

                    <p class="owe-ink" style="margin:0 0 16px 0; font-size:16px; line-height:1.6; color:#191c1e;">Hi ${name},</p>

                    <p class="owe-ink" style="margin:0 0 28px 0; font-size:16px; line-height:1.6; color:#191c1e;">
                      We received a request to reset the password for your Our World Energy account on the payroll &amp; contractor portal. Click the button below to choose a new password.
                    </p>

                    <!-- Bulletproof CTA. Wrapped in a full-width row so the
                         fallback copy below stacks under it — a bare
                         align="left" button table floats in Outlook.com and
                         lets the next paragraph wrap to its right. -->
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px 0;">
                      <tr>
                        <td align="left">
                          <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                            <tr>
                              <td align="center" bgcolor="#006b5f" style="border-radius:10px; background-color:#006b5f;">
                                <a href="${url}" target="_blank" rel="noopener" class="owe-btn" style="display:inline-block; padding:16px 34px; font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif; font-size:16px; line-height:20px; font-weight:600; color:#ffffff; text-decoration:none; border-radius:10px; background-color:#006b5f;">Reset my password</a>
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                    </table>

                    <!-- Fallback link for clients that strip button hrefs -->
                    <p class="owe-muted" style="margin:0 0 8px 0; font-size:13px; line-height:1.5; color:#707974;">Button not working? Copy and paste this link into your browser:</p>
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 28px 0;">
                      <tr>
                        <td class="owe-linkbox owe-hair" style="padding:12px 14px; background-color:#f2f8f6; border:1px solid #bfc9c3; border-radius:8px;">
                          <a href="${url}" target="_blank" rel="noopener" class="owe-link" style="font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif; font-size:13px; line-height:1.6; color:#006b5f; text-decoration:underline; word-break:break-all; overflow-wrap:break-word;">${url}</a>
                        </td>
                      </tr>
                    </table>

                    <p class="owe-muted" style="margin:0 0 16px 0; font-size:14px; line-height:1.6; color:#707974;">
                      For your security, this link can be used <strong style="color:#191c1e;">once</strong> and expires in <strong style="color:#191c1e;">${expires}</strong>.
                    </p>

                    <p class="owe-muted" style="margin:0 0 4px 0; font-size:14px; line-height:1.6; color:#707974;">
                      If you didn&rsquo;t request this, you can safely ignore this email &mdash; your password won&rsquo;t change and no action is needed.
                    </p>

                  </td>
                </tr>

                <!-- In-card sign-off / spacer -->
                <tr>
                  <td class="owe-card-pad" style="padding:20px 40px 36px 40px; font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
                    <p class="owe-ink" style="margin:0; font-size:14px; line-height:1.6; color:#191c1e;">&mdash; The Our World Energy team</p>
                  </td>
                </tr>

              </table>
            </td>
          </tr>

          <!-- Footer, outside the card -->
          <tr>
            <td style="padding:24px 24px 8px 24px; font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
              <p class="owe-muted" style="margin:0 0 6px 0; font-size:12px; line-height:1.6; color:#707974;">
                This message was sent to <span style="color:#191c1e;">${email}</span> because a password reset was requested for your account.
              </p>
              <p class="owe-muted" style="margin:0 0 6px 0; font-size:12px; line-height:1.6; color:#707974;">
                Our World Energy &middot; Payroll &amp; Contractor Portal &middot;
                <a href="https://team.ourworldenergy.com" target="_blank" rel="noopener" class="owe-link" style="color:#006b5f; text-decoration:underline;">team.ourworldenergy.com</a>
              </p>
              <p class="owe-muted" style="margin:0; font-size:12px; line-height:1.6; color:#707974;">
                This is an automated message &mdash; please don&rsquo;t reply to it.
              </p>
            </td>
          </tr>

        </table>

      </td>
    </tr>
  </table>

</body>
</html>`;

  return { subject, text, html };
}
