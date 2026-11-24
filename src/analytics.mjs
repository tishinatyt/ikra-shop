import { config } from '../config.mjs';

const denied = { ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied', analytics_storage: 'denied' };
const granted = Object.fromEntries(Object.keys(denied).map(key => [key, 'granted']));

export function trackOrderConversion(result, order, gtag = globalThis.gtag) {
  if (result?.ok !== true || typeof gtag !== 'function') return false;
  const items = (order.items ?? []).map(item => ({ item_id: item.id, item_name: item.title,
    price: item.price, quantity: item.qty }));
  try {
    gtag('event', 'conversion', { send_to: config.analytics.conversions.order,
      value: order.total, currency: 'UAH', transaction_id: result.orderId });
    gtag('event', 'purchase', { transaction_id: result.orderId, value: order.total, currency: 'UAH', items });
  } catch { /* Analytics must never affect checkout. */ }
  return true;
}

function track(name, params) {
  try { globalThis.gtag?.('event', name, params); } catch { /* Analytics is optional. */ }
}

function commerceItems(lines) {
  return lines.map(p => ({ item_id: p.id, item_name: p.name, price: p.price, quantity: p.quantity }));
}

export function trackViewItem(product) {
  if (!product) return;
  track('view_item', { currency: 'UAH', value: product.price, items: [{ item_id: product.id,
    item_name: product.name, price: product.price, quantity: 1 }] });
}

export function trackAddToCart(lines) {
  const items = commerceItems(lines);
  track('add_to_cart', { currency: 'UAH', value: items.reduce((sum, item) => sum + item.price * item.quantity, 0), items });
}

export function trackBeginCheckout(lines) {
  const items = commerceItems(lines);
  track('begin_checkout', { currency: 'UAH', value: items.reduce((sum, item) => sum + item.price * item.quantity, 0), items });
}

function initConsent() {
  const key = 'ikra-cookie-consent-v1';
  const gtag = globalThis.gtag;
  let choice;
  try { choice = localStorage.getItem(key); } catch { /* Consent UI still works for this visit. */ }
  if (choice === 'accepted' || choice === 'rejected') {
    try { gtag?.('consent', 'update', choice === 'accepted' ? granted : denied); } catch { /* noop */ }
  }
  if (typeof document === 'undefined') return;
  const banner = document.querySelector('#cookie-consent');
  if (!banner || choice) return;
  banner.hidden = false;
  banner.addEventListener('click', event => {
    const action = event.target.closest('[data-consent]')?.dataset.consent;
    if (!action) return;
    const value = action === 'accept' ? granted : denied;
    try { gtag?.('consent', 'update', value); } catch { /* noop */ }
    try { localStorage.setItem(key, action === 'accept' ? 'accepted' : 'rejected'); } catch { /* noop */ }
    banner.hidden = true;
  });
}

initConsent();
trackViewItem(globalThis.__ikraProduct);

if (typeof document !== 'undefined') document.addEventListener('click', event => {
  const anchor = event.target.closest('a[href]');
  if (!anchor) return;
  const href = anchor.getAttribute('href') ?? '';
  let method;
  if (/^tel:/i.test(href)) method = 'phone';
  else if (/t\.me\//i.test(href)) method = 'telegram';
  else if (/viber:/i.test(href)) method = 'viber';
  if (method) {
    try { globalThis.gtag?.('event', 'conversion', { send_to: config.analytics.conversions.call }); } catch { /* noop */ }
    track('contact_click', { method });
  }
});

const orderForm = typeof document !== 'undefined' ? document.querySelector('#order') : null;
if (orderForm) {
  let checkoutSent = false;
  const observer = new MutationObserver(() => {
    if (checkoutSent || orderForm.hidden) return;
    checkoutSent = true;
    fetch(new URL('products.json', new URL('./', import.meta.url))).then(response => response.ok ? response.json() : [])
      .then(products => {
        let cart = {};
        try { cart = JSON.parse(localStorage.getItem('golden-roe-cart-v1') ?? '{}'); } catch { /* noop */ }
        const lines = products.filter(p => Number.isInteger(cart[p.id]) && cart[p.id] > 0).map(p => ({ ...p, quantity: cart[p.id] }));
        if (lines.length) trackBeginCheckout(lines);
      }).catch(() => {});
  });
  observer.observe(orderForm, { attributes: true, attributeFilter: ['hidden'] });
}
