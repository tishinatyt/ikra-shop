import { config } from './config.mjs';
import { money, escape, productPath, selectSets } from './shop.mjs';
import { trackAddToCart, trackOrderConversion } from './analytics.mjs';

const storageKey = 'golden-roe-cart-v1';
const maxOrderItems = 30;
const maxOrderQty = 50;
const shopRoot = new URL('./', import.meta.url);
const count = document.querySelector('#cart-count');
const cartStatus = document.querySelector('#cart-status');
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
const notice = document.querySelector('#notice');
const seasonBanner = document.querySelector('[data-season-until]');
if (seasonBanner) {
  const date = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Kyiv', dateStyle: 'short' }).format(new Date());
  seasonBanner.hidden = date > seasonBanner.dataset.seasonUntil;
}
let cart = {};
let timer;
let cartStatusTimer;
let cartBounce;
let products;
let pending = false;

function loadCart() {
  try {
    const value = JSON.parse(localStorage.getItem(storageKey) ?? '{}');
    return Object.fromEntries(Object.entries(value).filter(([, qty]) => Number.isInteger(qty) && qty > 0 && qty <= 99));
  } catch {
    return {};
  }
}
function saveCart() {
  try { localStorage.setItem(storageKey, JSON.stringify(cart)); } catch { /* In-memory cart is still usable. */ }
  updateCount();
}
function updateCount() {
  count.textContent = Object.values(cart).reduce((sum, qty) => sum + qty, 0);
}
function announce(message) {
  clearTimeout(timer);
  notice.textContent = message;
  timer = setTimeout(() => { notice.textContent = ''; }, 3200);
}
function confirmAdd(button) {
  clearTimeout(cartStatusTimer);
  cartStatus.textContent = '';
  cartStatusTimer = setTimeout(() => { cartStatus.textContent = 'Додано в кошик'; }, 40);
  if (reduceMotion.matches || !button.animate) return;

  const from = button.getBoundingClientRect();
  const to = count.getBoundingClientRect();
  const sx = from.left + from.width / 2;
  const sy = from.top + from.height / 2;
  const dx = to.left + to.width / 2 - sx;
  const dy = to.top + to.height / 2 - sy;
  const lift = Math.min(95, 35 + Math.hypot(dx, dy) * .16);
  const grain = document.createElement('span');
  grain.className = 'roe-flight';
  grain.setAttribute('aria-hidden', 'true');
  document.body.append(grain);

  const positions = Array.from({ length: 13 }, (_, i) => {
    const t = i / 12;
    return { transform: 'translate(' + (sx + dx * t - 9) + 'px,' +
      (sy + dy * t - 4 * lift * t * (1 - t) - 9) + 'px) scale(' + (1 - .35 * t) + ')' };
  });
  const flight = grain.animate(positions, { duration: 600, easing: 'cubic-bezier(.25,.65,.5,1)' });
  flight.oncancel = () => grain.remove();
  flight.onfinish = () => {
    grain.remove();
    if (reduceMotion.matches) return;
    cartBounce?.cancel();
    cartBounce = count.animate([
      { transform: 'translateY(0)' }, { transform: 'translateY(-4px) scale(1.14)' }, { transform: 'translateY(0)' }
    ], { duration: 240, easing: 'ease-out' });
  };
}
function getProducts() {
  products ??= fetch(new URL('products.json', shopRoot)).then(async response => {
    if (!response.ok) throw new Error('Не вдалося завантажити каталог');
    return response.json();
  }).catch(error => { products = undefined; throw error; });
  return products;
}

cart = loadCart();
updateCount();
window.addEventListener('storage', event => {
  if (event.key !== storageKey && event.key !== null) return;
  cart = loadCart();
  updateCount();
  if (document.querySelector('#order') && !pending) renderOrder().catch(() => announce('Не вдалося завантажити кошик.'));
});
document.addEventListener('click', async event => {
  const button = event.target.closest('[data-add]');
  if (!button) return;
  const id = button.dataset.add;
  try {
    const items = button.dataset.kind === 'set'
      ? selectSets(await getProducts()).find(set => set.id === id)?.items.map(item => item.id)
      : [id];
    if (!items?.length) return;
    const next = { ...cart };
    for (const item of items) {
      if ((next[item] ?? 0) >= maxOrderQty) {
        announce('У кошику може бути до 50 одиниць кожного товару.');
        return;
      }
      next[item] = (next[item] ?? 0) + 1;
    }
    if (Object.keys(next).length > maxOrderItems) {
      announce('В одному замовленні може бути до 30 різних товарів.');
      return;
    }
    cart = next;
    saveCart();
    try {
      const catalog = await getProducts();
      trackAddToCart(items.map(item => catalog.find(product => product.id === item)).filter(Boolean).map(product => ({ ...product, quantity: 1 })));
    } catch { /* Cart stays usable when analytics data is unavailable. */ }
    confirmAdd(button);
  } catch {
    announce('Не вдалося додати товар. Спробуйте ще раз.');
  }
});

const filters = document.querySelector('#filters');
if (filters && !filters.hidden) {
  const catalog = document.querySelector('#catalog');
  const cards = new Map([...catalog.children].map(card => [card.dataset.id, card]));
  const results = document.querySelector('#results');
  async function filterCatalog() {
    try {
      const source = await getProducts();
      const options = new FormData(filters);
      const selected = source.filter(p => {
        for (const key of ['species', 'brand', 'weight', 'packaging', 'availability']) {
          if (options.get(key) && String(p[key]) !== options.get(key)) return false;
        }
        const min = options.get('min');
        const max = options.get('max');
        return (!min || (p.price != null && p.price >= Number(min))) &&
          (!max || (p.price != null && p.price <= Number(max)));
      });
      const sort = options.get('sort');
      if (sort === 'name') selected.sort((a, b) => a.name.localeCompare(b.name, 'uk'));
      if (sort === 'asc' || sort === 'desc') selected.sort((a, b) => {
        if (a.price == null || b.price == null) return Number(a.price == null) - Number(b.price == null);
        return sort === 'asc' ? a.price - b.price : b.price - a.price;
      });
      catalog.replaceChildren(...selected.map(p => cards.get(p.id)));
      results.textContent = selected.length ? 'Товарів: ' + selected.length : 'За цими фільтрами товарів немає.';
    } catch {
      announce('Не вдалося оновити каталог.');
    }
  }
  filters.addEventListener('input', filterCatalog);
  filters.addEventListener('reset', () => setTimeout(filterCatalog, 0));
  filters.addEventListener('submit', event => event.preventDefault());
}

const form = document.querySelector('#order');
const list = document.querySelector('#cart-items');
const total = document.querySelector('#cart-total');
const shippingHint = document.querySelector('#shipping-hint');
const shippingProgress = document.querySelector('#shipping-progress');
const result = document.querySelector('#order-result');
const orderFallback = document.querySelector('#order-fallback');
let updateDeliveryOptions = () => {};

async function getLines() {
  return (await getProducts()).filter(p => Object.hasOwn(cart, p.id)).map(p => ({ ...p, quantity: cart[p.id] }));
}
function orderTotal(lines) {
  return lines.some(p => p.price == null) ? null :
    lines.reduce((sum, p) => sum + Math.round(p.price * 100) * p.quantity, 0) / 100;
}
function cartThumbnail(product) {
  if (!product.photo) return '<span class="ice-photo cart-thumbnail" aria-hidden="true"></span>';
  const source = new URL(product.photo.small, shopRoot).href;
  return '<span class="ice-photo cart-thumbnail"><img class="' +
    (product.photo.multiplySmall ? 'photo-multiply' : '') + '" src="' + escape(source) +
    '" alt="" width="64" height="64" decoding="async"></span>';
}
async function renderOrder() {
  const lines = await getLines();
  const missing = Object.keys(cart).filter(id => !lines.some(p => p.id === id));
  const totalPrice = orderTotal(lines);
  const grams = lines.reduce((sum, product) => sum + product.weight * product.quantity, 0);
  list.innerHTML = lines.map(p => `<article class="line-item"><div class="line-item-product">${cartThumbnail(p)}<div><a href="${escape(new URL(productPath(p), shopRoot).href)}">${escape(p.name)}</a><br>${money(p.price)}<br><span class="stock ${p.availability === 'in_stock' ? 'in-stock' : 'preorder'}">${p.availability === 'in_stock' ? 'В наявності' : 'Під замовлення — термін уточнимо під час підтвердження'}</span></div></div>
<label>Кількість<input type="number" min="1" max="${maxOrderQty}" step="1" value="${p.quantity}" data-quantity="${escape(p.id)}"></label>
<button class="button secondary" data-remove="${escape(p.id)}">Видалити</button></article>`).join('') + missing.map(id =>
    '<article class="line-item">Товар більше не представлено в каталозі <button class="button secondary" data-remove="' +
    escape(id) + '">Видалити</button></article>').join('');
  if (!lines.length && !missing.length) list.innerHTML = '<p>Ваш кошик порожній. <a href="../katalog/">Перейти до каталогу</a></p>';
  total.textContent = lines.length ? 'Разом за товари: ' + money(totalPrice) + ' · Вага: ' + grams + ' г' : '';
  if (shippingHint && shippingProgress) {
    const threshold = config.shippingThresholdGrams;
    shippingProgress.setAttribute('aria-valuenow', String(Math.min(grams, threshold)));
    shippingProgress.firstElementChild.style.width = Math.min(100, grams / threshold * 100) + '%';
    shippingHint.textContent = grams < threshold
      ? 'Додайте ще ' + (threshold - grams) + ' г — і доставка буде безкоштовною (кур’єр по Чернігову або Нова Пошта). Самовивіз доступний завжди.'
      : 'Вага для безкоштовної доставки досягнута. Кур’єр по Чернігову або Нова Пошта — безкоштовно.';
  }
  updateDeliveryOptions(grams);
  form.hidden = !lines.length || !!missing.length;
}

function localDigits(value) {
  const digits = value.replace(/\D/g, '');
  if (value.startsWith('+')) return digits.startsWith('380') ? digits.slice(3, 12) : '';
  if (digits.startsWith('380') && digits.length > 9) return digits.slice(3, 12);
  return (digits.startsWith('0') ? digits.slice(1) : digits).slice(0, 9);
}

if (form) {
  const delivery = form.elements.namedItem('delivery');
  const deliveryFields = [...form.querySelectorAll('[data-delivery]')];
  const shippingOptions = [...delivery.querySelectorAll('[data-paid-delivery]')];
  const paymentHint = document.querySelector('#payment-hint');
  let cartGrams = 0;
  function updatePaymentHint() {
    paymentHint.textContent = delivery.value === 'pickup'
      ? 'Оплата при отриманні під час самовивозу.'
      : 'Передоплата на картку. Реквізити надішлемо після підтвердження замовлення.';
  }
  function updateDelivery() {
    for (const fieldset of deliveryFields) {
      const inactive = fieldset.dataset.delivery !== delivery.value;
      if ('disabled' in fieldset) fieldset.disabled = inactive;
      fieldset.hidden = inactive;
    }
    updatePaymentHint();
  }
  updateDeliveryOptions = grams => {
    cartGrams = grams;
    const allowed = grams >= config.shippingThresholdGrams;
    for (const option of shippingOptions) option.disabled = !allowed;
    if (!allowed && delivery.value !== 'pickup') delivery.value = 'pickup';
    updateDelivery();
  };
  updateDelivery();
  delivery.addEventListener('change', updateDelivery);
  renderOrder().catch(() => { list.textContent = 'Не вдалося завантажити кошик.'; });
  list.addEventListener('change', async event => {
    const id = event.target.dataset.quantity;
    if (!id || pending) return;
    const value = event.target.valueAsNumber;
    if (Number.isInteger(value) && value >= 1 && value <= maxOrderQty) {
      cart = { ...cart, [id]: value };
      saveCart();
    }
    await renderOrder();
  });
  list.addEventListener('click', async event => {
    const id = event.target.closest('[data-remove]')?.dataset.remove;
    if (!id || pending) return;
    delete cart[id];
    saveCart();
    await renderOrder();
  });
  const phone = form.elements.phone;
  phone.addEventListener('input', () => {
    const digits = localDigits(phone.value);
    phone.value = digits ? '+380 (' + digits.slice(0, 2) +
      (digits.length >= 2 ? ') ' + digits.slice(2, 5) : '') +
      (digits.length > 5 ? '-' + digits.slice(5, 7) : '') +
      (digits.length > 7 ? '-' + digits.slice(7, 9) : '') : '';
    phone.setCustomValidity('');
  });
  phone.addEventListener('keydown', event => {
    if (event.key !== 'Backspace' || phone.selectionStart !== phone.value.length || phone.selectionStart !== phone.selectionEnd ||
      /\d$/.test(phone.value) || !phone.value) return;
    event.preventDefault();
    phone.value = phone.value.replace(/[\s)-]+$/, '').slice(0, -1);
    phone.dispatchEvent(new Event('input'));
  });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (pending) return;
    orderFallback.hidden = true;
    result.textContent = '';
    const fields = Object.fromEntries([...new FormData(form)].map(([key, value]) => [key, value.trim()]));
    const digits = localDigits(fields.phone);
    if (!/^[1-9]\d{8}$/.test(digits)) {
      phone.setCustomValidity('Введіть 9 цифр після +380.');
      phone.reportValidity();
      return;
    }
    const required = fields.delivery === 'pickup' ? [fields.name] : fields.delivery === 'chernihiv'
      ? [fields.name, fields.address] : [fields.name, fields.city, fields.npBranch];
    if (!required.every(Boolean)) {
      result.textContent = 'Заповніть ім’я та дані для вибраного способу доставки.';
      result.focus();
      return;
    }
    const submit = form.querySelector('button');
    pending = true;
    submit.disabled = true;
    try {
      const lines = await getLines();
      if (!lines.length || lines.length !== Object.keys(cart).length) {
        throw new Error('Кошик змінився');
      }
      if (lines.length > maxOrderItems || lines.some(p => p.quantity > maxOrderQty)) {
        result.textContent = 'У замовленні може бути до 30 різних товарів і до 50 одиниць кожного.';
        return;
      }
      const payable = orderTotal(lines);
      if (payable == null || payable <= 0) {
        result.textContent = 'Уточніть вартість товарів перед оформленням замовлення.';
        return;
      }
      const actualGrams = lines.reduce((sum, product) => sum + product.weight * product.quantity, 0);
      if (fields.delivery !== 'pickup' && actualGrams < config.shippingThresholdGrams) {
        result.textContent = 'Для безкоштовної доставки додайте ще ' + (config.shippingThresholdGrams - actualGrams) + ' г або виберіть самовивіз.';
        return;
      }
      const order = { ...fields, phone: '+380' + digits,
        items: lines.map(({ id, name, quantity, price, weight }) => ({ id, title: name, qty: quantity, price, grams: weight })),
        total: payable };
      const response = await config.submitOrder(order);
      trackOrderConversion(response, order);
      for (const { id, quantity } of lines) {
        const remaining = (cart[id] ?? 0) - quantity;
        if (remaining > 0) cart[id] = remaining;
        else delete cart[id];
      }
      saveCart();
      form.reset();
      updateDelivery();
      await renderOrder();
      result.textContent = response.message;
    } catch (error) {
      if (error?.code === 'UNAVAILABLE') {
        result.textContent = 'Не вдалося надіслати. Зателефонуйте: ' + config.phoneDisplay;
        orderFallback.hidden = false;
      } else if (error?.code === 'INVALID_CART') {
        result.textContent = 'Перевірте кошик і спробуйте ще раз.';
      } else {
        result.textContent = 'Не вдалося оформити замовлення. Перевірте дані форми й спробуйте ще раз.';
      }
    } finally {
      pending = false;
      submit.disabled = false;
      result.focus();
    }
  });
}
