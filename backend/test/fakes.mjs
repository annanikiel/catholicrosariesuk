// In-memory stand-ins for DynamoDB and SES, just enough for the handlers' calls.
import { setClients } from '../src/lib/clients.mjs';

export function installFakes() {
  const table = new Map();
  const sent = [];
  const conditionFailed = () => Object.assign(new Error('condition'), { name: 'ConditionalCheckFailedException' });

  const dynamo = {
    async send(cmd) {
      const i = cmd.input;
      const key = i.Key?.email?.S ?? i.Item?.email?.S;
      switch (cmd.constructor.name) {
        case 'GetItemCommand':
          return { Item: table.has(key) ? structuredClone(table.get(key)) : undefined };
        case 'PutItemCommand':
          if (table.get(key)?.status?.S === 'confirmed') throw conditionFailed();
          table.set(key, structuredClone(i.Item));
          return {};
        case 'UpdateItemCommand': {
          const item = table.get(key);
          if (!item || item.confirmToken?.S !== i.ExpressionAttributeValues[':t'].S) throw conditionFailed();
          item.status = { S: 'confirmed' };
          item.confirmedAt = i.ExpressionAttributeValues[':now'];
          delete item.confirmToken;
          delete item.expiresAt;
          return {};
        }
        case 'DeleteItemCommand':
          table.delete(key);
          return {};
        default:
          throw new Error(`unexpected ${cmd.constructor.name}`);
      }
    },
  };
  const ses = {
    async send(cmd) {
      sent.push(cmd.input);
      return { MessageId: String(sent.length) };
    },
  };
  setClients({ dynamo, ses });

  process.env.TABLE_NAME = 'subscribers';
  process.env.FROM_ADDRESS = 'Catholic Rosaries UK <hello@catholicrosaries.uk>';
  process.env.OWNER_EMAIL = 'owner@example.com';
  process.env.SITE_URL = 'https://catholicrosaries.uk';
  return { table, sent };
}

export const post = (body, extra = {}) => ({
  body: JSON.stringify(body),
  headers: { 'content-type': 'application/json' },
  requestContext: { http: { sourceIp: '203.0.113.9' } },
  ...extra,
});
