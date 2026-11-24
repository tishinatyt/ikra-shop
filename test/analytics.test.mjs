import assert from 'node:assert/strict';
import test from 'node:test';
import { trackOrderConversion } from '../src/analytics.mjs';

test('Google Ads conversion and GA4 purchase fire only after ok:true', () => {
  const calls = [];
  const gtag = (...args) => calls.push(args);
  const order = { total: 245, items: [{ id: 'roe-1', title: 'Ікра', price: 245, qty: 1 }] };

  assert.equal(trackOrderConversion({ ok: false, orderId: 'ZZ-0000-0001' }, order, gtag), false);
  assert.equal(trackOrderConversion(null, order, gtag), false);
  assert.deepEqual(calls, []);

  assert.equal(trackOrderConversion({ ok: true, orderId: 'ZZ-2026-0001' }, order, gtag), true);
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[0], ['event', 'conversion', {
    send_to: 'AW-18593348016/dxdmCMvKxr4dELDz_6FF', value: 245, currency: 'UAH', transaction_id: 'ZZ-2026-0001'
  }]);
  assert.deepEqual(calls[1], ['event', 'purchase', {
    transaction_id: 'ZZ-2026-0001', value: 245, currency: 'UAH',
    items: [{ item_id: 'roe-1', item_name: 'Ікра', price: 245, quantity: 1 }]
  }]);
});
