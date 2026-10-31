import { randomBytes, timingSafeEqual } from 'node:crypto';

export const newToken = () => randomBytes(24).toString('base64url');

// Email addresses travel in links as base64url so they survive email clients and URL encoding.
export const encodeEmail = (email) => Buffer.from(email, 'utf8').toString('base64url');
export function decodeEmail(value) {
  if (typeof value !== 'string' || value.length > 400) return null;
  try {
    return Buffer.from(value, 'base64url').toString('utf8');
  } catch {
    return null;
  }
}

export function tokensMatch(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

export function linkWithToken(siteUrl, page, email, token) {
  const url = new URL(page, siteUrl.replace(/\/*$/, '/'));
  url.searchParams.set('e', encodeEmail(email));
  url.searchParams.set('t', token);
  return url.toString();
}
