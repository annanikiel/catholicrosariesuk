// POST /unsubscribe — deletes a subscriber. Accepts { e, t } either as JSON (from unsubscribe.html)
// or in the query string, which is how email apps send RFC 8058 one-click unsubscribe requests.
import { GetItemCommand, DeleteItemCommand } from '@aws-sdk/client-dynamodb';
import { clients } from './lib/clients.mjs';
import { ok, notFound, serverError, parseBody } from './lib/http.mjs';
import { normaliseEmail } from './lib/validate.mjs';
import { decodeEmail, tokensMatch } from './lib/tokens.mjs';

export async function handler(event) {
  const query = event.queryStringParameters || {};
  const body = parseBody(event);
  const encoded = query.e || body.e;
  const token = query.t || body.t;
  const email = normaliseEmail(decodeEmail(encoded));
  if (!email || typeof token !== 'string' || !token) return notFound('invalid-link');

  const table = process.env.TABLE_NAME;
  try {
    const { Item: item } = await clients.dynamo.send(
      new GetItemCommand({ TableName: table, Key: { email: { S: email } }, ConsistentRead: true }),
    );
    if (!item || !tokensMatch(item.unsubscribeToken?.S, token)) return notFound('invalid-link');

    await clients.dynamo.send(new DeleteItemCommand({ TableName: table, Key: { email: { S: email } } }));
    return ok();
  } catch (err) {
    console.error('unsubscribe: failed', err);
    return serverError();
  }
}
