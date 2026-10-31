import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { installFakes, post } from './fakes.mjs';
import { handler as contact } from '../src/contact.mjs';
import { handler as subscribe } from '../src/subscribe.mjs';
import { handler as confirm } from '../src/confirm.mjs';
import { handler as unsubscribe } from '../src/unsubscribe.mjs';

let table, sent;
beforeEach(() => ({ table, sent } = installFakes()));

const body = (res) => JSON.parse(res.body);
const linkParams = (text) => {
  const url = new URL(text.match(/https:\/\/catholicrosaries\.uk\/newsletter-confirm\.html\S+/)[0]);
  return { e: url.searchParams.get('e'), t: url.searchParams.get('t') };
};

// ---------- contact ----------
test('contact: emails the owner with Reply-To set to the sender', async () => {
  const res = await contact(post({ name: 'Mary', email: 'Mary@Example.com', message: 'Hello!\nDo you make tenners?', elapsedMs: 8000 }));
  assert.equal(res.statusCode, 200);
  assert.equal(sent.length, 1);
  assert.deepEqual(sent[0].Destination.ToAddresses, ['owner@example.com']);
  assert.deepEqual(sent[0].ReplyToAddresses, ['mary@example.com']);
  assert.match(sent[0].Content.Simple.Subject.Data, /Mary/);
  assert.match(sent[0].Content.Simple.Body.Text.Data, /Do you make tenners\?/);
});

test('contact: rejects bad input', async () => {
  assert.equal(body(await contact(post({ name: '', email: 'a@b.co', message: 'x', elapsedMs: 9000 }))).error, 'invalid-name');
  assert.equal(body(await contact(post({ name: 'A', email: 'nope', message: 'x', elapsedMs: 9000 }))).error, 'invalid-email');
  assert.equal(body(await contact(post({ name: 'A', email: 'a@b.co', message: '  ', elapsedMs: 9000 }))).error, 'invalid-message');
  assert.equal(sent.length, 0);
});

test('contact: header injection in the name is flattened', async () => {
  await contact(post({ name: 'Eve\r\nBcc: x@evil.test', email: 'eve@example.com', message: 'hi', elapsedMs: 9000 }));
  assert.doesNotMatch(sent[0].Content.Simple.Subject.Data, /[\r\n]/);
});

test('contact: honeypot and too-fast submissions are silently dropped', async () => {
  assert.equal((await contact(post({ name: 'Bot', email: 'b@b.co', message: 'buy', website: 'http://spam', elapsedMs: 9000 }))).statusCode, 200);
  assert.equal((await contact(post({ name: 'Bot', email: 'b@b.co', message: 'buy', elapsedMs: 200 }))).statusCode, 200);
  assert.equal(sent.length, 0);
});

test('contact: SES failure returns 500', async () => {
  const { setClients } = await import('../src/lib/clients.mjs');
  setClients({ ses: { send: async () => { throw new Error('boom'); } } });
  const orig = console.error; console.error = () => {};
  const res = await contact(post({ name: 'A', email: 'a@b.co', message: 'hi', elapsedMs: 9000 }));
  console.error = orig;
  assert.equal(res.statusCode, 500);
});

// ---------- newsletter: full double opt-in round trip ----------
test('subscribe -> confirm -> unsubscribe', async () => {
  let res = await subscribe(post({ email: 'Joseph@Example.com', elapsedMs: 5000 }));
  assert.equal(res.statusCode, 200);
  assert.equal(table.get('joseph@example.com').status.S, 'pending');
  assert.ok(table.get('joseph@example.com').expiresAt);
  assert.equal(sent.length, 1);
  assert.deepEqual(sent[0].Destination.ToAddresses, ['joseph@example.com']);

  const { e, t } = linkParams(sent[0].Content.Simple.Body.Text.Data);

  // Wrong token is refused.
  assert.equal((await confirm(post({ e, t: 'wrong' }))).statusCode, 404);

  res = await confirm(post({ e, t }));
  assert.equal(res.statusCode, 200);
  const item = table.get('joseph@example.com');
  assert.equal(item.status.S, 'confirmed');
  assert.equal(item.expiresAt, undefined);

  // Link can only be used once.
  assert.equal((await confirm(post({ e, t }))).statusCode, 404);

  // Signing up again while confirmed sends nothing and keeps them confirmed.
  await subscribe(post({ email: 'joseph@example.com', elapsedMs: 5000 }));
  assert.equal(sent.length, 1);
  assert.equal(table.get('joseph@example.com').status.S, 'confirmed');

  // Unsubscribe with the wrong token is refused; with the right one (one-click, query string) it deletes.
  const unsubToken = item.unsubscribeToken.S;
  assert.equal((await unsubscribe({ queryStringParameters: { e, t: 'nope' } })).statusCode, 404);
  res = await unsubscribe({
    queryStringParameters: { e, t: unsubToken },
    body: 'List-Unsubscribe=One-Click',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
  });
  assert.equal(res.statusCode, 200);
  assert.equal(table.has('joseph@example.com'), false);
});

test('unsubscribe: works from the unsubscribe page (JSON body)', async () => {
  await subscribe(post({ email: 'anne@example.com', elapsedMs: 5000 }));
  const { e } = linkParams(sent[0].Content.Simple.Body.Text.Data);
  const res = await unsubscribe(post({ e, t: table.get('anne@example.com').unsubscribeToken.S }));
  assert.equal(res.statusCode, 200);
  assert.equal(table.size, 0);
});

test('subscribe: does not re-send a confirmation within 10 minutes', async () => {
  await subscribe(post({ email: 'clare@example.com', elapsedMs: 5000 }));
  await subscribe(post({ email: 'clare@example.com', elapsedMs: 5000 }));
  assert.equal(sent.length, 1);
});

test('subscribe: resends after 10 minutes with a fresh token, keeping the unsubscribe token', async () => {
  await subscribe(post({ email: 'clare@example.com', elapsedMs: 5000 }));
  const first = structuredClone(table.get('clare@example.com'));
  table.get('clare@example.com').confirmSentAt.N = String(Date.now() - 11 * 60 * 1000);
  await subscribe(post({ email: 'clare@example.com', elapsedMs: 5000 }));
  const second = table.get('clare@example.com');
  assert.equal(sent.length, 2);
  assert.notEqual(second.confirmToken.S, first.confirmToken.S);
  assert.equal(second.unsubscribeToken.S, first.unsubscribeToken.S);
});

test('confirm: expired links are refused', async () => {
  await subscribe(post({ email: 'pat@example.com', elapsedMs: 5000 }));
  const { e, t } = linkParams(sent[0].Content.Simple.Body.Text.Data);
  table.get('pat@example.com').expiresAt.N = String(Math.floor(Date.now() / 1000) - 1);
  assert.equal((await confirm(post({ e, t }))).statusCode, 404);
});

test('subscribe: invalid email and bots', async () => {
  assert.equal(body(await subscribe(post({ email: 'not-an-email', elapsedMs: 5000 }))).error, 'invalid-email');
  assert.equal((await subscribe(post({ email: 'bot@example.com', website: 'x', elapsedMs: 5000 }))).statusCode, 200);
  assert.equal(sent.length, 0);
  assert.equal(table.size, 0);
});

test('malformed requests do not crash', async () => {
  for (const fn of [contact, subscribe, confirm, unsubscribe]) {
    const res = await fn({ body: '{not json', headers: { 'content-type': 'application/json' } });
    assert.ok([400, 404].includes(res.statusCode));
    const res2 = await fn({});
    assert.ok([400, 404].includes(res2.statusCode));
  }
});
