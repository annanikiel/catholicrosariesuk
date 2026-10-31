// AWS SDK clients, created once per Lambda container. Tests replace these via setClients().
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { SESv2Client } from '@aws-sdk/client-sesv2';

export const clients = {
  dynamo: new DynamoDBClient({}),
  ses: new SESv2Client({}),
};

export function setClients(overrides) {
  Object.assign(clients, overrides);
}
