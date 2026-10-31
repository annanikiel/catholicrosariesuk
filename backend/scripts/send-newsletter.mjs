#!/usr/bin/env node
// Sends a newsletter to every confirmed subscriber, using Amazon SES.
//
//   npm run newsletter -- --subject "Advent rosaries" --html newsletters/example.html --text newsletters/example.txt
//       Dry run: shows how many people it would go to. Nothing is sent.
//   ... --to you@example.com      Sends one test copy to you.
//   ... --send                    Sends it to everyone on the list.
//
// Each email gets a personal unsubscribe link in the footer plus List-Unsubscribe headers,
// so Gmail, Outlook and Apple Mail show their own "Unsubscribe" button.
// Settings are read from the CloudFormation stack outputs (--stack, default "catholic-rosaries-backend").
import { readFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { CloudFormationClient, DescribeStacksCommand } from '@aws-sdk/client-cloudformation';
import { ScanCommand } from '@aws-sdk/client-dynamodb';
import { clients } from '../src/lib/clients.mjs';
import { sendEmail, layout, escapeHtml } from '../src/lib/emails.mjs';
import { linkWithToken, encodeEmail } from '../src/lib/tokens.mjs';

const { values: args } = parseArgs({
  options: {
    subject: { type: 'string' },
    html: { type: 'string' },
    text: { type: 'string' },
    to: { type: 'string' },
    send: { type: 'boolean', default: false },
    stack: { type: 'string', default: 'catholic-rosaries-backend' },
  },
});

if (!args.subject || !args.html || !args.text) {
  console.error('Usage: npm run newsletter -- --subject "..." --html file.html --text file.txt [--to you@example.com | --send]');
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function stackOutputs(stackName) {
  const cf = new CloudFormationClient({});
  const { Stacks } = await cf.send(new DescribeStacksCommand({ StackName: stackName }));
  return Object.fromEntries((Stacks[0].Outputs || []).map((o) => [o.OutputKey, o.OutputValue]));
}

async function confirmedSubscribers(table) {
  const people = [];
  let ExclusiveStartKey;
  do {
    const page = await clients.dynamo.send(
      new ScanCommand({
        TableName: table,
        FilterExpression: '#s = :c',
        ExpressionAttributeNames: { '#s': 'status' },
        ExpressionAttributeValues: { ':c': { S: 'confirmed' } },
        ExclusiveStartKey,
      }),
    );
    for (const item of page.Items) people.push({ email: item.email.S, token: item.unsubscribeToken.S });
    ExclusiveStartKey = page.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  return people;
}

function buildEmail({ subject, htmlBody, textBody, siteUrl, apiUrl, email, token }) {
  const pageUrl = linkWithToken(siteUrl, 'unsubscribe.html', email, token);
  const oneClick = `${apiUrl}/unsubscribe?e=${encodeEmail(email)}&t=${encodeURIComponent(token)}`;
  const footerHtml = `
<hr style="border:none;border-top:1px solid #F0E3DE;margin:32px 0 16px;">
<p style="margin:0;font-size:13px;color:#5A3A44;">You're receiving this because you signed up at <a href="${escapeHtml(siteUrl)}" style="color:#A8324E;">CatholicRosaries.uk</a>.
<a href="${escapeHtml(pageUrl)}" style="color:#A8324E;">Unsubscribe</a>.</p>`;
  return {
    to: email,
    subject,
    html: layout(htmlBody + footerHtml),
    text: `${textBody.trim()}\n\n--\nYou're receiving this because you signed up at CatholicRosaries.uk.\nUnsubscribe: ${pageUrl}\n`,
    headers: [
      { Name: 'List-Unsubscribe', Value: `<${oneClick}>` },
      { Name: 'List-Unsubscribe-Post', Value: 'List-Unsubscribe=One-Click' },
    ],
  };
}

const out = await stackOutputs(args.stack);
process.env.FROM_ADDRESS = out.FromAddress;
const common = {
  subject: args.subject,
  htmlBody: await readFile(args.html, 'utf8'),
  textBody: await readFile(args.text, 'utf8'),
  siteUrl: out.SiteUrl,
  apiUrl: out.ApiUrl,
};

if (args.to) {
  await sendEmail(buildEmail({ ...common, email: args.to, token: 'test-copy' }));
  console.log(`Test copy sent to ${args.to}. (Its unsubscribe link is a dummy.)`);
  process.exit(0);
}

const people = await confirmedSubscribers(out.TableName);
console.log(`${people.length} confirmed subscriber(s).`);
if (!args.send) {
  console.log('Dry run: nothing sent. Add --to you@example.com for a test copy, or --send to send to everyone.');
  process.exit(0);
}

let sent = 0;
let failed = 0;
for (const person of people) {
  try {
    await sendEmail(buildEmail({ ...common, ...person }));
    sent++;
  } catch (err) {
    failed++;
    console.error(`Failed: ${person.email}: ${err.message}`);
  }
  await sleep(100); // stay well under SES's sending rate
}
console.log(`Done. Sent ${sent}, failed ${failed}.`);
