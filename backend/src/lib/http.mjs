// Helpers for API Gateway HTTP API (payload format 2.0) events.

export function json(statusCode, body) {
  return {
    statusCode,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
    body: JSON.stringify(body),
  };
}

export const ok = (body = { ok: true }) => json(200, body);
export const badRequest = (error) => json(400, { error });
export const notFound = (error = 'not-found') => json(404, { error });
export const serverError = () => json(500, { error: 'server-error' });

// Parses a JSON or form-encoded body. Returns {} if it can't be parsed.
export function parseBody(event) {
  if (!event || !event.body) return {};
  const raw = event.isBase64Encoded
    ? Buffer.from(event.body, 'base64').toString('utf8')
    : event.body;
  if (raw.length > 20000) return {};
  const type = (event.headers?.['content-type'] || '').toLowerCase();
  try {
    if (type.includes('application/x-www-form-urlencoded')) {
      return Object.fromEntries(new URLSearchParams(raw));
    }
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export function sourceIp(event) {
  return event?.requestContext?.http?.sourceIp || 'unknown';
}
