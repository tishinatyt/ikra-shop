import assert from 'node:assert/strict';
import test from 'node:test';
import { config } from '../config.mjs';
import { createHandler } from '../supabase/functions/ikra-order/handler.ts';

const url = config.orderFunctionUrl;
const allowed = ['https://ikra.fun', 'https://www.ikra.fun', 'https://tishinatyt.github.io',
  'http://localhost', 'http://localhost:80', 'http://127.0.0.1:4173', 'http://192.168.1.9:8080', 'http://10.2.4.5:65535'];
const blocked = ['https://example.invalid', 'http://localhost.example.invalid:80',
  'http://172.16.0.5:8080', 'http://192.168.256.1:8080', 'http://10.1.2.3:65536', 'null'];
const request = (origin, method, body) => new Request(url, { method,
  headers: { Origin: origin, 'Content-Type': 'application/json',
    ...(method === 'OPTIONS' && { 'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'content-type, authorization, apikey, x-client-info' }) },
  body: body === undefined ? undefined : JSON.stringify(body) });

test('preflight reflects only allowed origins and logs rejected origins', async t => {
  const warn = t.mock.method(console, 'warn', () => {});
  const handler = createHandler({ env: () => undefined });
  for (const origin of allowed) {
    const response = await handler(request(origin, 'OPTIONS'));
    assert.equal(response.status, 204, origin);
    assert.equal(response.headers.get('access-control-allow-origin'), origin);
    assert.equal(response.headers.get('access-control-allow-methods'), 'POST, OPTIONS');
    assert.equal(response.headers.get('access-control-allow-headers'), 'content-type, authorization, apikey, x-client-info');
    assert.equal(response.headers.get('access-control-max-age'), '86400');
    assert.equal(response.headers.get('vary'), 'Origin');
    assert.equal(await response.text(), '');
  }
  for (const origin of blocked) {
    const response = await handler(request(origin, 'OPTIONS'));
    assert.equal(response.status, 403, origin);
    assert.equal(response.headers.get('access-control-allow-origin'), null);
    assert.equal(response.headers.get('vary'), 'Origin');
  }
  assert.deepEqual(warn.mock.calls.map(c => c.arguments), blocked.map(o => ['blocked origin', o]));
});

test('Telegram receives escaped HTML and logs error details without the token or message', async t => {
  const logs = t.mock.method(console, 'error', () => {});
  const newChatId = -1001234567890;
  let sent;
  const handler = createHandler({ env: () => 'fixture-secret',
    send: async (_url, { body }) => {
      sent = JSON.parse(body);
      return Response.json({ ok: false, error_code: 400,
        description: `Bad Request: group migrated ${sent.text} fixture-secret`,
        parameters: { migrate_to_chat_id: newChatId } }, { status: 400 });
    } });
  const base = { name: 'Ім’я <div>&', phone: '0636002006', delivery: 'chernihiv', address: '<p>Адреса</p>',
    comment: '<br>', items: [{ id: 'rkp-1-18', title: '<i>Ікра</i>', qty: 5, grams: 200, price: 5 }], total: 25 };
  const invalidCart = await handler(request(allowed[0], 'POST', { ...base, total: 26 }));
  assert.equal(invalidCart.status, 400);
  assert.equal((await invalidCart.json()).code, 'INVALID_CART');
  const invalidAddress = await handler(request(allowed[0], 'POST', { ...base, address: '' }));
  assert.equal((await invalidAddress.json()).code, 'INVALID_ORDER');
  assert.equal((await handler(request(allowed[0], 'POST', base))).status, 502);
  assert.equal(sent.parse_mode, 'HTML');
  assert.match(sent.text, /<b>Ім’я:<\/b> Ім’я &lt;div&gt;&amp;\n<b>Телефон:<\/b> \+380636002006\n/);
  assert.match(sent.text, /&lt;p&gt;Адреса&lt;\/p&gt;/);
  assert.match(sent.text, /&lt;i&gt;Ікра&lt;\/i&gt;/);
  assert.match(sent.text, /&lt;br&gt;/);
  assert.match(sent.text, /<b>Оплата:<\/b> Передоплата на картку/);
  assert.match(sent.text, /<b>Вага:<\/b> 1000 г/);
  assert.match(sent.text, /1000 г; В наявності/);
  assert.doesNotMatch(sent.text.replace(/<\/?b>/g, ''), /[<>]|tel:/);
  assert.deepEqual(logs.mock.calls.map(c => c.arguments), [
    ['ikra-order:', 'total does not match items'],
    ['ikra-order:', 'missing local address'],
    ['ikra-order:', 'Telegram rejected sendMessage: HTTP 400, API code 400', {
      description: 'Bad Request: group migrated [redacted] [redacted]',
      parameters: { migrate_to_chat_id: newChatId }
    }]
  ]);
});

test('delivery is rejected below 1000 g and accepted at exactly 1000 g using catalog weights', async t => {
  t.mock.method(console, 'error', () => {});
  let message = '';
  const handler = createHandler({ env: () => 'fixture-secret', send: async (_url, { body }) => {
    message = JSON.parse(body).text;
    return Response.json({ ok: true });
  } });
  const base = { name: 'Покупець', phone: '0636002006', delivery: 'novaposhta', city: 'Чернігів', npBranch: '1',
    items: [{ id: 'rkp-1-16', title: 'Форель 500 г', qty: 1, grams: 500, price: 100 }], total: 100 };
  const below = await handler(request(allowed[0], 'POST', base));
  assert.equal(below.status, 400);
  assert.equal((await below.json()).code, 'INVALID_CART');
  const exact = await handler(request(allowed[0], 'POST', { ...base,
    items: [{ ...base.items[0], qty: 2 }], total: 200 }));
  assert.equal(exact.status, 200);
  assert.match(message, /<b>Оплата:<\/b> Передоплата на картку/);
  assert.match(message, /<b>Вага:<\/b> 1000 г/);
  assert.match(message, /1000 г; В наявності/);
  const copper = await handler(request(allowed[0], 'POST', { ...base,
    items: [{ id: 'rkp-1-01', title: 'Ікра кети Copper River, 500 г', qty: 2, grams: 500, price: 100 }], total: 200 }));
  assert.equal(copper.status, 200);
  assert.match(message, /Ікра кети Copper River, 500 г × 2 \(1000 г; В наявності\)/);
  const spoofed = await handler(request(allowed[0], 'POST', { ...base,
    items: [{ ...base.items[0], grams: 1000 }] }));
  assert.equal(spoofed.status, 400);
});

test('checkout distinguishes rejected carts from network errors and server failures', async t => {
  const fetch = t.mock.method(globalThis, 'fetch', async () => { throw new TypeError('Failed to fetch'); });
  await assert.rejects(config.submitOrder({}), { code: 'UNAVAILABLE' });
  fetch.mock.mockImplementation(async () => new Response('bad gateway', { status: 502 }));
  await assert.rejects(config.submitOrder({}), { code: 'UNAVAILABLE' });
  fetch.mock.mockImplementation(async () => Response.json({ code: 'INVALID_CART' }, { status: 400 }));
  await assert.rejects(config.submitOrder({}), { code: 'INVALID_CART' });
  fetch.mock.mockImplementation(async () => Response.json({ code: 'INVALID_ORDER' }, { status: 400 }));
  await assert.rejects(config.submitOrder({}), { code: 'REJECTED' });
  fetch.mock.mockImplementation(async () => Response.json({ ok: true, orderNumber: 'ZZ-2211-0042' }));
  assert.match((await config.submitOrder({})).message, /ZZ-2211-0042/);
});
