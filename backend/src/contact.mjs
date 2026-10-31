// POST /contact — emails a contact form message to the owner, with Reply-To set to the sender.
import { ok, badRequest, serverError, parseBody, sourceIp } from './lib/http.mjs';
import { cleanText, singleLine, normaliseEmail, looksLikeSpam } from './lib/validate.mjs';
import { sendEmail, contactEmail } from './lib/emails.mjs';

export async function handler(event) {
  const body = parseBody(event);

  // Pretend to succeed so bots don't learn anything.
  if (looksLikeSpam(body, 3000)) return ok();

  const name = singleLine(body.name, 100);
  const email = normaliseEmail(body.email);
  const message = cleanText(body.message, 5000);
  if (!name) return badRequest('invalid-name');
  if (!email) return badRequest('invalid-email');
  if (!message) return badRequest('invalid-message');

  const content = contactEmail({
    name,
    email,
    message,
    ip: sourceIp(event),
    when: new Date().toLocaleString('en-GB', { timeZone: 'Europe/London' }),
  });

  try {
    await sendEmail({ to: process.env.OWNER_EMAIL, replyTo: email, ...content });
    return ok();
  } catch (err) {
    console.error('contact: failed to send', err);
    return serverError();
  }
}
