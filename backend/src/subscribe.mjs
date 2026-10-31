// POST /subscribe — first step of double opt-in: stores a pending subscriber and emails a confirmation link.
import { GetItemCommand, PutItemCommand } from '@aws-sdk/client-dynamodb';
import { clients } from './lib/clients.mjs';
import { ok, badRequest, serverError, parseBody } from './lib/http.mjs';
import { normaliseEmail, looksLikeSpam } from './lib/validate.mjs';
import { newToken, linkWithToken } from './lib/tokens.mjs';
import { sendEmail, confirmationEmail } from './lib/emails.mjs';

export const PENDING_TTL_SECONDS = 7 * 24 * 60 * 60; // unconfirmed sign-ups are deleted after 7 days
const RESEND_AFTER_MS = 10 * 60 * 1000; // don't email the same address more than once every 10 minutes

export async function handler(event) {
  const body = parseBody(event);
  if (looksLikeSpam(body, 1500)) return ok();

  const email = normaliseEmail(body.email);
  if (!email) return badRequest('invalid-email');

  const table = process.env.TABLE_NAME;
  const now = Date.now();

  try {
    const { Item: existing } = await clients.dynamo.send(
      new GetItemCommand({ TableName: table, Key: { email: { S: email } }, ConsistentRead: true }),
    );

    // Already subscribed: say "check your inbox" either way, so the form can't be used to look up subscribers.
    if (existing?.status?.S === 'confirmed') return ok();
    if (existing?.status?.S === 'pending' && now - Number(existing.confirmSentAt?.N || 0) < RESEND_AFTER_MS) {
      return ok();
    }

    const confirmToken = newToken();
    await clients.dynamo.send(
      new PutItemCommand({
        TableName: table,
        Item: {
          email: { S: email },
          status: { S: 'pending' },
          confirmToken: { S: confirmToken },
          unsubscribeToken: { S: existing?.unsubscribeToken?.S || newToken() },
          createdAt: { S: new Date(now).toISOString() },
          confirmSentAt: { N: String(now) },
          expiresAt: { N: String(Math.floor(now / 1000) + PENDING_TTL_SECONDS) },
        },
        // Never overwrite someone who confirmed in the meantime.
        ConditionExpression: 'attribute_not_exists(email) OR #s <> :confirmed',
        ExpressionAttributeNames: { '#s': 'status' },
        ExpressionAttributeValues: { ':confirmed': { S: 'confirmed' } },
      }),
    );

    const confirmUrl = linkWithToken(process.env.SITE_URL, 'newsletter-confirm.html', email, confirmToken);
    await sendEmail({ to: email, ...confirmationEmail({ confirmUrl }) });
    return ok();
  } catch (err) {
    if (err.name === 'ConditionalCheckFailedException') return ok();
    console.error('subscribe: failed', err);
    return serverError();
  }
}
