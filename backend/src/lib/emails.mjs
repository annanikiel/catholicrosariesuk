// Email content and sending via Amazon SES (v2 API).
import { SendEmailCommand } from '@aws-sdk/client-sesv2';
import { clients } from './clients.mjs';

export const escapeHtml = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export async function sendEmail({ to, replyTo, subject, text, html, headers }) {
  const simple = {
    Subject: { Data: subject, Charset: 'UTF-8' },
    Body: { Text: { Data: text, Charset: 'UTF-8' } },
  };
  if (html) simple.Body.Html = { Data: html, Charset: 'UTF-8' };
  if (headers?.length) simple.Headers = headers;

  const input = {
    FromEmailAddress: process.env.FROM_ADDRESS,
    Destination: { ToAddresses: [to] },
    Content: { Simple: simple },
  };
  if (replyTo) input.ReplyToAddresses = [replyTo];
  if (process.env.CONFIGURATION_SET) input.ConfigurationSetName = process.env.CONFIGURATION_SET;
  return clients.ses.send(new SendEmailCommand(input));
}

export function contactEmail({ name, email, message, ip, when }) {
  return {
    subject: `Website message from ${name}`,
    text: [
      `New message from the CatholicRosaries.uk contact form.`,
      ``,
      `Name:  ${name}`,
      `Email: ${email}`,
      `Sent:  ${when}`,
      `IP:    ${ip}`,
      ``,
      `----------------------------------------`,
      message,
      `----------------------------------------`,
      ``,
      `Just press Reply to answer ${name} directly.`,
    ].join('\n'),
  };
}

// Simple, brand-coloured wrapper used for the confirmation email.
export function layout(innerHtml) {
  return `<!doctype html>
<html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;background:#FFF8F3;font-family:'Nunito Sans',Arial,sans-serif;color:#2A0B14;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FFF8F3;"><tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#FFFFFF;border:1px solid #F0E3DE;border-radius:24px;">
<tr><td style="padding:36px 32px;font-size:17px;line-height:1.6;color:#4A3240;">
<p style="margin:0 0 20px;font-family:Georgia,serif;font-size:22px;color:#2A0B14;">Catholic Rosaries <span style="color:#A8324E;">UK</span></p>
${innerHtml}
</td></tr></table>
</td></tr></table>
</body></html>`;
}

export function confirmationEmail({ confirmUrl }) {
  const url = escapeHtml(confirmUrl);
  return {
    subject: 'Please confirm your subscription to Catholic Rosaries UK',
    text: [
      `Thank you for signing up to the Catholic Rosaries UK newsletter.`,
      ``,
      `Please confirm your subscription by opening this link:`,
      confirmUrl,
      ``,
      `The link lasts for 7 days. If you didn't sign up, just ignore this email and you won't hear from us again.`,
      ``,
      `God bless,`,
      `Catholic Rosaries UK`,
    ].join('\n'),
    html: layout(`
<p style="margin:0 0 16px;">Thank you for signing up to the Catholic Rosaries UK newsletter: new pieces, restocks and seasonal devotions.</p>
<p style="margin:0 0 24px;">Please confirm your subscription:</p>
<p style="margin:0 0 24px;"><a href="${url}" style="display:inline-block;background:#2A0B14;color:#FFF8F3;text-decoration:none;font-weight:700;padding:14px 28px;border-radius:999px;">Confirm my subscription</a></p>
<p style="margin:0 0 16px;font-size:14px;color:#5A3A44;">Or copy this link into your browser:<br><a href="${url}" style="color:#A8324E;word-break:break-all;">${url}</a></p>
<p style="margin:0 0 16px;font-size:14px;color:#5A3A44;">The link lasts for 7 days. If you didn't sign up, just ignore this email and you won't hear from us again.</p>
<p style="margin:0;">God bless,<br>Catholic Rosaries UK</p>`),
  };
}
