type Dependencies = {
  env: (key: string) => string | undefined;
  send?: typeof fetch;
  now?: () => Date;
};

const origins = new Set(['https://ikra.fun', 'https://www.ikra.fun', 'https://tishinatyt.github.io']);
const fields = { name: 80, phone: 32, address: 180, city: 100, npBranch: 120, time: 60, comment: 400 };
const maxBodyBytes = 16_384;
const limits = { windowMs: 600_000, maxPosts: 5, maxIps: 10_000 };
const shippingThresholdGrams = 1000;
const productCatalog: Record<string, { grams: number; availability: 'in_stock' | 'preorder' }> = {
  'rkp-1-03': { grams: 500, availability: 'preorder' }, 'rkp-1-06': { grams: 190, availability: 'preorder' },
  'rkp-1-01': { grams: 500, availability: 'in_stock' },
  'rkp-1-10': { grams: 500, availability: 'preorder' }, 'rkp-1-12': { grams: 250, availability: 'preorder' },
  'rkp-1-13': { grams: 200, availability: 'in_stock' }, 'rkp-1-14': { grams: 100, availability: 'preorder' },
  'rkp-1-16': { grams: 500, availability: 'in_stock' }, 'rkp-1-17': { grams: 250, availability: 'preorder' },
  'rkp-1-18': { grams: 200, availability: 'in_stock' }, 'rkp-1-19': { grams: 100, availability: 'preorder' },
  'rkp-1-22': { grams: 500, availability: 'preorder' }, 'rkp-1-24': { grams: 250, availability: 'preorder' },
  'rkp-1-25': { grams: 200, availability: 'in_stock' }, 'rkp-1-26': { grams: 100, availability: 'preorder' },
  'rkp-1-28': { grams: 500, availability: 'preorder' }, 'rkp-1-29': { grams: 250, availability: 'preorder' },
  'rkp-1-30': { grams: 200, availability: 'preorder' }, 'rkp-1-31': { grams: 100, availability: 'preorder' },
  'rkp-1-32': { grams: 500, availability: 'preorder' }, 'rkp-1-33': { grams: 250, availability: 'preorder' },
  'rkp-1-34': { grams: 200, availability: 'preorder' }, 'rkp-1-35': { grams: 100, availability: 'preorder' },
  'rkp-1-36': { grams: 500, availability: 'preorder' }, 'rkp-1-37': { grams: 250, availability: 'preorder' },
  'rkp-1-38': { grams: 200, availability: 'preorder' }, 'rkp-1-39': { grams: 100, availability: 'preorder' },
  'rkp-2-05': { grams: 190, availability: 'preorder' }, 'rkp-2-06': { grams: 100, availability: 'preorder' },
  'rkp-2-07': { grams: 100, availability: 'preorder' }, 'rkp-2-15': { grams: 120, availability: 'preorder' },
  'rkp-2-17': { grams: 100, availability: 'preorder' }, 'rkp-2-18': { grams: 230, availability: 'preorder' }
};
const kyiv = 'Europe/Kyiv';
const stamp = new Intl.DateTimeFormat('uk-UA', { timeZone: kyiv, dateStyle: 'short', timeStyle: 'short' });
const numberDate = new Intl.DateTimeFormat('en-GB', { timeZone: kyiv, day: '2-digit', month: '2-digit' });
const money = new Intl.NumberFormat('uk-UA', { style: 'currency', currency: 'UAH', maximumFractionDigits: 2 });

const escape = (value: string) => value.replace(/[&<>"']/g, character =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!);
const isObject = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
function allowedOrigin(origin: string) {
  if (origins.has(origin)) return true;
  const match = /^http:\/\/(localhost|127\.0\.0\.1|192\.168\.\d{1,3}\.\d{1,3}|10(?:\.\d{1,3}){3})(?::(\d{1,5}))?$/.exec(origin);
  if (!match) return false;
  const [, host, port = '80'] = match;
  return Number(port) > 0 && Number(port) <= 65535 &&
    (host === 'localhost' || host.split('.').every(part => Number(part) <= 255 && String(Number(part)) === part));
}
function phoneNumber(input: string) {
  const value = input.replace(/[\s()-]/g, '');
  const match = value.match(/^(?:\+?380|0)([1-9]\d{8})$/);
  return match ? '+380' + match[1] : null;
}
function cents(value: unknown, max: number) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0 || value > max) return null;
  const rounded = Math.round(value * 100);
  return Math.abs(value * 100 - rounded) < 1e-5 ? rounded : null;
}
const invalid = (reason: string, code = 'INVALID_ORDER') => ({ reason, code });
function validate(data: Record<string, unknown>) {
  const clean: Record<keyof typeof fields, string> = {
    name: '', phone: '', address: '', city: '', npBranch: '', time: '', comment: ''
  };
  for (const [key, max] of Object.entries(fields)) {
    const input = data[key];
    if (input === undefined) continue;
    if (typeof input !== 'string' || input.length > max || /[\x00-\x08\x0b-\x1f\x7f]/.test(input)) {
      return invalid('invalid field: ' + key);
    }
    clean[key as keyof typeof fields] = input.trim().replace(/\s+/g, ' ');
  }
  const phone = phoneNumber(clean.phone);
  if (!clean.name) return invalid('missing name');
  if (!phone) return invalid('invalid phone format');
  const delivery = data.delivery;
  if (delivery !== 'pickup' && delivery !== 'chernihiv' && delivery !== 'novaposhta') return invalid('invalid delivery method');
  if (delivery === 'chernihiv' && !clean.address) return invalid('missing local address');
  if (delivery === 'novaposhta' && (!clean.city || !clean.npBranch)) return invalid('missing city or branch');
  if (!Array.isArray(data.items) || data.items.length < 1 || data.items.length > 30) {
    return invalid('invalid item count', 'INVALID_CART');
  }
  const items: { id: string; title: string; qty: number; grams: number; availability: 'in_stock' | 'preorder'; subtotal: number }[] = [];
  const seen = new Set<string>();
  let totalGrams = 0;
  for (const item of data.items) {
    if (!isObject(item)) return invalid('invalid item shape', 'INVALID_CART');
    const { id, title, qty, grams } = item;
    const price = cents(item.price, 1_000_000);
    if (typeof id !== 'string' || !Object.hasOwn(productCatalog, id) || seen.has(id)) {
      return invalid('invalid or duplicate item id', 'INVALID_CART');
    }
    const catalogProduct = productCatalog[id];
    if (typeof grams !== 'number' || grams !== catalogProduct.grams) return invalid('item weight does not match product', 'INVALID_CART');
    if (typeof title !== 'string' || !title.trim() || title.length > 80 || /[\x00-\x1f\x7f]/.test(title)) {
      return invalid('invalid item title', 'INVALID_CART');
    }
    if (typeof qty !== 'number' || !Number.isInteger(qty) || qty < 1 || qty > 50) {
      return invalid('invalid item quantity', 'INVALID_CART');
    }
    if (price === null) return invalid('invalid item price', 'INVALID_CART');
    items.push({ id, title: title.trim(), qty, grams, availability: catalogProduct.availability, subtotal: qty * price });
    totalGrams += grams * qty;
    seen.add(id);
  }
  if (delivery !== 'pickup' && totalGrams < shippingThresholdGrams) return invalid('delivery requires at least 1000 g', 'INVALID_CART');
  const total = items.reduce((sum, item) => sum + item.subtotal, 0);
  if (cents(data.total, 1_500_000_000) !== total) return invalid('total does not match items', 'INVALID_CART');
  return { ...clean, phone, delivery, items, total, totalGrams };
}

export function createHandler({ env, send = fetch, now = () => new Date() }: Dependencies) {
  const attempts = new Map<string, { count: number; expires: number }>();
  return async function handler(request: Request): Promise<Response> {
    const origin = request.headers.get('origin') ?? '';
    const headers = new Headers({ 'Content-Type': 'application/json; charset=utf-8', Vary: 'Origin', 'Cache-Control': 'no-store' });
    const reply = (status: number, body: object) => new Response(JSON.stringify(body), { status, headers });
    const reject = (status: number, error: string, reason: string, code?: string) => {
      console.error('ikra-order:', reason);
      return reply(status, { error, ...(code && { code }) });
    };
    if (!allowedOrigin(origin)) {
      console.warn('blocked origin', origin);
      return reply(403, { error: 'Origin not allowed' });
    }
    headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    headers.set('Access-Control-Allow-Headers', 'content-type, authorization, apikey, x-client-info');
    headers.set('Access-Control-Max-Age', '86400');
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (request.method !== 'POST') return reject(405, 'Method not allowed', 'unexpected method');
    if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') {
      return reject(415, 'Expected JSON', 'invalid content type');
    }
    if (Number(request.headers.get('content-length')) > maxBodyBytes) return reject(413, 'Payload too large', 'content length exceeds limit');
    let data: unknown;
    try {
      const reader = request.body?.getReader();
      if (!reader) return reject(400, 'Missing body', 'request body missing');
      const buffer = new Uint8Array(maxBodyBytes);
      let bytes = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (bytes + value.byteLength > buffer.length) {
          await reader.cancel();
          return reject(413, 'Payload too large', 'stream exceeds size limit');
        }
        buffer.set(value, bytes);
        bytes += value.byteLength;
      }
      data = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(buffer.subarray(0, bytes)));
    } catch {
      return reject(400, 'Invalid JSON', 'cannot decode JSON body');
    }
    if (!isObject(data)) return reject(400, 'Invalid payload', 'body is not a JSON object');
    if (data.website) return reply(200, { ok: true });

    const date = now();
    const timestamp = date.getTime();
    for (const [key, attempt] of attempts) if (attempt.expires <= timestamp) attempts.delete(key);
    const ip = (request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown')
      .split(',')[0].trim().slice(0, 100);
    const attempt = attempts.get(ip) ?? { count: 0, expires: timestamp + limits.windowMs };
    if (attempt.count >= limits.maxPosts || (!attempts.has(ip) && attempts.size >= limits.maxIps)) {
      return reply(429, { error: 'Too many requests' });
    }
    attempt.count++;
    attempts.set(ip, attempt);

    const order = validate(data);
    if ('reason' in order) return reject(400, 'Invalid order', order.reason, order.code);
    const token = env('TELEGRAM_BOT_TOKEN');
    const chatId = env('IKRA_TG_CHAT_ID');
    if (!token || !chatId) return reject(503, 'Order service unavailable', 'Telegram configuration missing');
    const digits = crypto.getRandomValues(new Uint32Array(1))[0] % 10_000;
    const number = 'ZZ-' + numberDate.format(date).replace('/', '') + '-' + String(digits).padStart(4, '0');
    const address = order.delivery === 'pickup'
      ? 'Самовивіз: Чернігів, вул. Мстиславська, 67, щодня 9:00–20:00'
      : order.delivery === 'chernihiv'
        ? 'Кур’єр по Чернігову: ' + order.address
        : 'Нова Пошта, ' + order.city + ', відділення ' + order.npBranch;
    const payment = order.delivery === 'pickup' ? 'Оплата при отриманні' : 'Передоплата на картку';
    const text = [
      '<b>Нове замовлення №' + number + '</b>', '',
      '<b>Ім’я:</b> ' + escape(order.name),
      '<b>Телефон:</b> ' + order.phone,
      '<b>Доставка:</b> ' + escape(address),
      '<b>Оплата:</b> ' + payment,
      '<b>Бажаний час:</b> ' + escape(order.time || 'Не вказано'), '',
      ...order.items.map(item => escape(item.title) + ' × ' + item.qty + ' (' + item.grams * item.qty + ' г; ' +
        (item.availability === 'in_stock' ? 'В наявності' : 'Під замовлення') + ') = ' + money.format(item.subtotal / 100)),
      '', '<b>Вага:</b> ' + order.totalGrams + ' г',
      '<b>Разом:</b> ' + money.format(order.total / 100),
      '<b>Коментар:</b> ' + escape(order.comment || 'Не вказано'),
      '<b>Час замовлення (Київ):</b> ' + stamp.format(date)
    ].join('\n');
    const rendered = text.replace(/<[^>]+>/g, '').replace(/&(?:amp|lt|gt|quot|#39);/g, 'x');
    if (rendered.length > 4096) return reject(413, 'Order message too long', 'Telegram text exceeds limit');
    try {
      const response = await send('https://api.telegram.org/bot' + token + '/sendMessage', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML', link_preview_options: { is_disabled: true } }),
        signal: AbortSignal.timeout(10_000)
      });
      const status = await response.json().catch(() => null);
      if (!response.ok || status?.ok !== true) {
        const apiCode = Number.isInteger(status?.error_code) ? ', API code ' + status.error_code : '';
        const description = typeof status?.description === 'string'
          ? status.description.replaceAll(text, '[redacted]').replaceAll(token, '[redacted]')
          : undefined;
        const parameters = {
          ...(Number.isSafeInteger(status?.parameters?.migrate_to_chat_id) && {
            migrate_to_chat_id: status.parameters.migrate_to_chat_id
          }),
          ...(Number.isSafeInteger(status?.parameters?.retry_after) && {
            retry_after: status.parameters.retry_after
          })
        };
        console.error('ikra-order:', 'Telegram rejected sendMessage: HTTP ' + response.status + apiCode, {
          description,
          ...(Object.keys(parameters).length > 0 && { parameters })
        });
        return reply(502, { error: 'Order delivery failed' });
      }
    } catch (error) {
      const reason = error instanceof Error && error.name === 'TimeoutError' ? 'Telegram request timed out' : 'Telegram request failed';
      return reject(502, 'Order delivery failed', reason);
    }
    return reply(200, { ok: true, orderNumber: number });
  };
}
