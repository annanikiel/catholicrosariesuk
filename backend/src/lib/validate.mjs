// Input validation and spam checks shared by the handlers.

// Deliberately simple: one @, no spaces, a dot in the domain. SES rejects anything stranger.
const EMAIL_RE = /^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[^\s@<>()",;:]{2,}$/;

export function cleanText(value, maxLength) {
  if (typeof value !== 'string') return '';
  // Drop control characters except newlines and tabs.
  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, maxLength);
}

// For values that end up in an email header (e.g. the subject line).
export function singleLine(value, maxLength) {
  return cleanText(value, maxLength).replace(/[\r\n\t]+/g, ' ');
}

export function normaliseEmail(value) {
  if (typeof value !== 'string') return null;
  const email = value.trim().toLowerCase();
  if (email.length > 254 || !EMAIL_RE.test(email)) return null;
  return email;
}

// Bots tend to fill in the hidden "website" field, or submit faster than a person can type.
export function looksLikeSpam(body, minElapsedMs) {
  if (typeof body.website === 'string' && body.website.trim() !== '') return true;
  const elapsed = Number(body.elapsedMs);
  if (Number.isFinite(elapsed) && elapsed < minElapsedMs) return true;
  return false;
}
