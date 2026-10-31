// POST /subscribe/confirm — second step of double opt-in. Body: { e, t } from the confirmation link.
import { GetItemCommand, UpdateItemCommand } from '@aws-sdk/client-dynamodb';
import { clients } from './lib/clients.mjs';
import { ok, notFound, serverError, parseBody } from './lib/http.mjs';
import { normaliseEmail } from './lib/validate.mjs';
import { decodeEmail, tokensMatch } from './lib/tokens.mjs';

export async function handler(event) {
  const body = parseBody(event);
  const email = normaliseEmail(decodeEmail(body.e));
  const token = typeof body.t === 'string' ? body.t : '';
  if (!email || !token) return notFound('invalid-link');

  const table = process.env.TABLE_NAME;
  try {
    const { Item: item } = await clients.dynamo.send(
      new GetItemCommand({ TableName: table, Key: { email: { S: email } }, ConsistentRead: true }),
    );
    const expired = Number(item?.expiresAt?.N || 0) < Date.now() / 1000;
    if (!item || item.status?.S !== 'pending' || expired || !tokensMatch(item.confirmToken?.S, token)) {
      return notFound('invalid-link');
    }

    await clients.dynamo.send(
      new UpdateItemCommand({
        TableName: table,
        Key: { email: { S: email } },
        UpdateExpression: 'SET #s = :confirmed, confirmedAt = :now REMOVE confirmToken, expiresAt',
        ConditionExpression: 'confirmToken = :t',
        ExpressionAttributeNames: { '#s': 'status' },
        ExpressionAttributeValues: {
          ':confirmed': { S: 'confirmed' },
          ':now': { S: new Date().toISOString() },
          ':t': { S: token },
        },
      }),
    );
    return ok();
  } catch (err) {
    if (err.name === 'ConditionalCheckFailedException') return notFound('invalid-link');
    console.error('confirm: failed', err);
    return serverError();
  }
}
