import { cp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { varieties, snippet } from './seo-content.mjs';
import { config } from '../config.mjs';
import { packaging, species, stocks, money, escape as e, productPath, selectHits, selectSets } from '../src/shop.mjs';

const products = JSON.parse(await readFile('data/products.json', 'utf8')).filter(p => p.visible === true);
products.sort((a, b) => Number(b.availability === 'in_stock') - Number(a.availability === 'in_stock'));
const copperSource = 'assets/products/copper-river-keta-500.webp';
if (products.some(p => p.id === 'rkp-1-01')) {
  await sharp(await readFile(copperSource)).resize({ width: 480, withoutEnlargement: true }).webp({ quality: 88 })
    .toFile('assets/products/copper-river-keta-500-480.webp');
  await sharp(await readFile(copperSource)).resize({ width: 960, withoutEnlargement: true }).webp({ quality: 90 })
    .toFile('assets/products/copper-river-keta-500-960.webp');
}
const unique = field => new Set(products.map(p => p[field])).size === products.length;
if (!unique('slug') || !unique('id') || products.some(p =>
  !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(p.slug) || !p.id || !p.name || !p.brand ||
  !Object.hasOwn(species, p.species) || !Object.hasOwn(packaging, p.packaging) ||
  !Object.hasOwn(stocks, p.availability) || !Number.isFinite(p.weight) || p.weight <= 0 ||
  !p.temperature || (p.price != null && (!Number.isFinite(p.price) || p.price <= 0)) ||
  (p.photo && ![p.photo.small, p.photo.large].every(path => /^media\/products\/[a-z0-9-]+\.webp$/.test(path)))
)) throw new Error('Перевірте дані товарів і унікальність id та slug.');

const photoFiles = new Set(products.flatMap(p => p.photo ? [p.photo.small, p.photo.large] : []));
const photoAsset = path => path.replace(/^media\//, 'assets/');
const opaqueLightPhotos = new Set();
await Promise.all([...photoFiles].map(async path => {
  const photo = sharp(await readFile(photoAsset(path)));
  if ((await photo.metadata()).hasAlpha) return;
  const { data, info } = await photo.resize(12, 12, { fit: 'fill' }).toColourspace('srgb')
    .raw().toBuffer({ resolveWithObject: true });
  const corners = [0, 11, 132, 143];
  if (corners.every(pixel => [0, 1, 2].every(channel => data[pixel * info.channels + channel] >= 230))) {
    opaqueLightPhotos.add(path);
  }
}));

const base = config.siteUrl ? new URL(config.siteUrl.replace(/\/+$/, '') + '/') : null;
const absolute = path => base ? new URL(path, base).href : '/' + path;
const schema = (type, fields) => ({ '@context': 'https://schema.org', '@type': type, ...fields });
const json = value => JSON.stringify(value).replace(/</g, '\\u003c');
const pages = new Map();
const brandPath = 'media/brand/';
const brandAlt = config.siteName;
const organizationLogo = brandPath + 'icon-512.png';
const producerPath = 'pro-vyrobnyka/';
const warrantyPath = 'harantiia/';
const deliveryPath = 'dostavka-chernihiv/';
const seasonPath = 'ikra-na-novyi-rik/';
const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Kyiv', dateStyle: 'short' }).format(new Date());
const seasonalBanner = config.newYearPromotionUntil && today <= config.newYearPromotionUntil;
const homeTitle = 'Червона ікра в Чернігові — самовивіз і доставка';
const deliverySummary = 'Самовивіз у Чернігові або безкоштовна доставка кур’єром чи Новою Поштою від 1 кг продукції.';
const warrantyPromise = 'Якщо незалежна акредитована лабораторія підтвердить, що ікра з нашого магазину не натуральна, ми повернемо 100% вартості та компенсуємо витрати на експертизу.';
const faq = [
  ['Як працює доставка в Чернігові та по Україні?', config.localDeliveryTerms],
  ['Як діє гарантія натуральності?', warrantyPromise + ' Для звернення збережіть банку з етикеткою та номер замовлення. Строк звернення — 14 днів із дня отримання.', warrantyPath],
  ['Як зберігати червону ікру?', 'Зберігайте банку в холодильнику за температури, вказаної виробником на етикетці. Після відкриття дотримуйтеся умов зберігання для відкритої упаковки.'],
  ['Який термін придатності?', 'Перевіряйте дату на банці. Термін залежить від виробника, фасування й умов зберігання.'],
  ['Як вибрати якісну ікру?', 'Перевірте склад, вид риби, виробника, строк придатності й цілісність упаковки. Ікринки різних видів відрізняються розміром і кольором.'],
  ['Як зберігати ікру після отримання?', 'Після отримання помістіть ікру в холодильник і дотримуйтеся температури та умов зберігання, вказаних виробником на етикетці.']
];
const organization = schema('Store', {
  name: config.siteName, ...(base && { url: base.href }), ...(config.phone && { telephone: config.phone }),
  areaServed: [{ '@type': 'City', name: 'Чернігів' }, { '@type': 'Country', name: 'Україна' }],
  ...(config.address && { address: config.address }),
  openingHours: config.openingHours,
  openingHoursSpecification: [{ '@type': 'OpeningHoursSpecification', dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'], opens: '09:00', closes: '20:00' }],
  ...(config.telegram && { sameAs: [config.telegram] })
});
const link = (prefix, path, label) => '<a href="' + e(prefix + path) + '">' + e(label) + '</a>';
const phoneLink = config.phone ? link('', 'tel:' + config.phone, config.phoneDisplay || config.phone) : '';
const headerPhone = config.phone ? '<a class="header-phone" href="tel:' + e(config.phone) + '" aria-label="Зателефонувати: ' +
  e(config.phoneDisplay || config.phone) + '"><svg class="phone-icon" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><path d="M7 3H4a1 1 0 0 0-1 1c0 9.4 7.6 17 17 17a1 1 0 0 0 1-1v-3a1 1 0 0 0-.7-1l-4.3-1.2a1 1 0 0 0-1 .3l-1.4 1.7a13 13 0 0 1-6.4-6.4L9 9a1 1 0 0 0 .3-1L8 3.7A1 1 0 0 0 7 3z"/></svg><span>' +
  e(config.phoneDisplay || config.phone) + '</span></a>' : '';
const contactLinks = () => '<div class="contact-links">' + phoneLink +
  [[config.telegram, 'Написати в Telegram'], [config.viber, 'Написати у Viber']].filter(([url]) => url)
    .map(([url, label]) => '<a class="button secondary" href="' + e(url) + '">' + label + '</a>').join('') + '</div>';
const varietyPath = key => 'ikra-' + varieties[key][0] + '/';
const varietyLinks = prefix => '<ul class="variety-links">' + Object.keys(varieties)
  .map(key => '<li>' + link(prefix, varietyPath(key), 'Ікра ' + varieties[key][1]) + '</li>').join('') + '</ul>';
const faqBody = (entries, prefix = '') => entries.map(([q, a, path]) => '<details><summary>' + e(q) +
  '</summary><p>' + e(a) + (path ? ' ' + link(prefix, path, 'Умови гарантії') : '') + '</p></details>').join('');
const faqSchema = entries => schema('FAQPage', { mainEntity: entries.map(([name, text]) => ({
  '@type': 'Question', name, acceptedAnswer: { '@type': 'Answer', text }
})) });
const shield = '<span class="shield" aria-hidden="true"></span>';
const seal = `<svg class="warranty-seal" viewBox="0 0 160 160" aria-hidden="true" focusable="false">
<defs><path id="seal-ring" d="M80 80m-55 0a55 55 0 1 1 110 0a55 55 0 1 1-110 0"/></defs>
<circle cx="80" cy="80" r="76" fill="none" stroke="currentColor" stroke-width="2"/>
<circle cx="80" cy="80" r="45" fill="none" stroke="currentColor" stroke-width="1"/>
<text fill="currentColor" text-anchor="middle"><textPath href="#seal-ring" startOffset="25%">Гарантія натуральності</textPath></text>
<path d="M80 53 102 62v15c0 15-10 24-22 30-12-6-22-15-22-30V62zM69 79l8 8 15-16" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;
const warrantyLink = prefix => '<p class="warranty-link">' + shield + link(prefix, warrantyPath, 'Гарантія натуральності') + '</p>';

function image(p, prefix, eager = false) {
  if (!p.photo) return '<div class="placeholder ' + e(p.species) + '" role="img" aria-label="Фото готується: ' + e(species[p.species]) + '"><span>' + e(species[p.species]) + '</span><small>Фото готується</small></div>';
  const similar = p.photo_source === 'similar';
  const blend = p.photo_source === 'placeholder' ? '' :
    [p.photo.small, p.photo.large].every(path => opaqueLightPhotos.has(path)) ? ' photo-multiply' : '';
  const img = '<div class="ice-photo"><img class="product-photo' + blend + '" width="600" height="450" src="' + e(prefix + p.photo.small) +
    '" srcset="' + e(prefix + p.photo.small) + ' 480w, ' + e(prefix + p.photo.large) +
    ' 960w" sizes="' + (eager ? '(max-width: 760px) 92vw, 560px' : '(max-width: 760px) 45vw, 300px') +
    '" loading="' + (eager ? 'eager' : 'lazy') + '" decoding="async" alt="' +
    e(p.alt || ('Ікра ' + varieties[p.species][1] + ' «' + p.brand + '» ' + p.weight + ' г — купити в Чернігові')) + '"></div>';
  return similar ? '<figure class="similar-photo">' + img + '<figcaption>Фото іншого фасування</figcaption></figure>' : img;
}
function add(id, enabled, kind = 'product', availability = 'in_stock') {
  return '<button class="button" data-add="' + e(id) + '" data-kind="' + kind + '"' +
    (enabled ? '' : ' disabled') + '>' + (availability === 'preorder' ? 'Замовити' : 'До кошика') + '</button>';
}
function card(p, prefix) {
  return '<article class="card" data-id="' + e(p.id) + '"><a class="card-image" href="' + e(prefix + productPath(p)) +
    '">' + image(p, prefix) + '</a><div class="card-info"><p class="product-meta"><span>' + e(p.brand) + '</span><span>' + p.weight +
    ' г</span></p><h3>' + link(prefix, productPath(p), p.name) + '</h3><p class="stock ' + (p.availability === 'in_stock' ? 'in-stock' : 'preorder') + '">' + stocks[p.availability] +
    '</p><div class="card-buy"><strong>' + money(p.price) + '</strong>' + add(p.id, true, 'product', p.availability) +
    '</div>' + warrantyLink(prefix) + '</div></article>';
}
const grid = (items, prefix) => items.map(p => card(p, prefix)).join('');
function crumb(prefix, entries) {
  return '<nav class="breadcrumbs" aria-label="Шлях до сторінки">' + entries.map(([path, name], i) =>
    i === entries.length - 1 ? '<span aria-current="page">' + e(name) + '</span>' : link(prefix, path, name)).join('<span aria-hidden="true">/</span>') + '</nav>';
}
const breadcrumbSchema = entries => schema('BreadcrumbList', { itemListElement: entries.map(([path, name], i) => ({
  '@type': 'ListItem', position: i + 1, name, ...(base && { item: absolute(path) })
})) });
const entry = (path, subject, description, body, structured = [], options = {}) => {
  const fullTitle = subject + ' | ' + config.siteName;
  const title = fullTitle.length <= 60 ? fullTitle : subject + ' | ' + config.shortName;
  pages.set(path, { title, description, body, structured, ...options });
};

const home = [['', 'Головна']];
const catalog = [...home, ['katalog/', 'Каталог']];
const basket = [...home, ['koshyk/', 'Кошик']];
const producer = [...home, [producerPath, 'Про виробника']];
const warranty = [...home, [warrantyPath, 'Умови гарантії']];
const hits = selectHits(products);
const sets = selectSets(products);
const setCards = prefix => sets.map(set => '<article class="card">' + image(set.items[0], prefix) +
  '<div class="card-info"><h3>' + e(set.name) + '</h3><ul>' + set.items.map(p => '<li>' +
  link(prefix, productPath(p), p.name) + '</li>').join('') + '</ul><div class="card-buy"><strong>' +
  money(set.price) + '</strong>' + add(set.id, true, 'set') + '</div></div></article>').join('');
entry('', 'Червона ікра в Чернігові', 'Червона ікра в Чернігові: самовивіз на Мстиславській, 67. Безкоштовний кур’єр і Нова Пошта по Україні для замовлень від 1 кг. Ціни та наявність у каталозі.', `
<section class="hero"><canvas id="roe" aria-hidden="true"></canvas><div class="lid"><div class="lid-inner">
<h1>${homeTitle}</h1><p class="lead">${deliverySummary}</p>
<div class="hero-actions"><a class="button primary" href="katalog/">Перейти до каталогу</a><a href="#delivery">Умови доставки</a></div>
</div></div></section>
${seasonalBanner ? '<section class="slab" data-season-until="' + e(config.newYearPromotionUntil) + '"><h2>Ікра на Новий рік у Чернігові</h2><p>Добірка для святкового столу та подарунків.</p>' + link('', seasonPath, 'Переглянути новорічну добірку') + '</section>' : ''}
<section class="slab" id="hits"><div class="section-head"><h2>Хіти</h2><a href="katalog/">Весь каталог</a></div>
${hits.length ? '<div class="grid">' + grid(hits, '') + '</div>' : '<p class="empty">Добірку готуємо. Тут з’являться форель, горбуша, кета й чавича після оновлення асортименту.</p>'}</section>
<section class="slab warranty" id="warranty"><div class="warranty-inner">${seal}<div><h2>Гарантія натуральності</h2><p>${warrantyPromise}</p><a class="button" href="${warrantyPath}">Умови гарантії</a> <a href="${producerPath}#certificates">Сертифікати виробника</a></div></div></section>
<section class="slab" id="sets"><h2>Подарункові набори</h2>${sets.length ? '<div class="grid">' + setCards('') + '</div>' : '<p>Набори з кількох видів ікри з’являться після оновлення асортименту.</p>'}</section>
<section class="slab"><h2>Види ікри</h2>${varietyLinks('')}</section>
<section class="slab" id="delivery"><h2>Доставка в Чернігові та по Україні</h2><p>${e(config.localDeliveryTerms)}</p><p>${link('', deliveryPath, 'Докладніше про доставку')}</p><ul class="benefits"><li>Самовивіз щодня 9:00–20:00</li><li>Кур’єр і Нова Пошта безкоштовно від 1 кг</li><li>Оплата при отриманні для самовивозу</li><li>Передоплата на картку для доставки</li></ul></section>
<section class="slab" id="faq"><h2>Поширені запитання</h2>${faqBody(faq)}</section>`,
[faqSchema(faq)], { query: 'купити червону ікру в Чернігові' });

const standards = [
  ['Сертифікат FSSC 22000 (Bureau Veritas) — ТОВ «Рибкопродукт», № 20240057F/2, дійсний до 18.09.2028', 'fssc-22000-bureau-veritas'],
  ['Декларація виробника № 26-128 від 10.11.2026 — ікра горбуші', 'deklaratsiia-vyrobnyka-26-128']
];
const certificateFiles = await readdir('assets/certificates');
const certificates = await Promise.all(standards.map(async ([name, stem]) => {
  const file = certificateFiles.find(file => ['webp', 'jpg', 'jpeg', 'png'].some(ext => file === stem + '.' + ext));
  const thumbnail = certificateFiles.find(file => file === stem + '-480.webp') || file;
  return [name, file, thumbnail, file ? await sharp('assets/certificates/' + thumbnail).metadata() : {}];
}));
const certificateContent = certificates.some(([, file]) => file) ?
  '<div class="certificate-grid">' + certificates.map(([name, file, thumbnail, { width, height }]) =>
    '<figure class="certificate"><a href="../media/certificates/' + file + '"><img loading="lazy" width="' + width + '" height="' + height + '" src="../media/certificates/' + thumbnail +
      '" alt="' + e(name) + '"></a><figcaption><strong>' + e(name) + '</strong></figcaption>' +
    (file ? '' :
      '<div class="certificate-placeholder">Скан документа готується</div>') + '</figure>').join('') + '</div>' :
  '<p>Система безпечності харчових продуктів сертифікована за FSSC 22000 (включає ISO 22000:2018 та ISO/TS 22002-1).</p>';

entry(producerPath, 'Про виробника Рибкопродукт', 'Дізнайтеся про українського виробника ікри Рибкопродукт, його торгові марки, походження сировини, сертифікати та контроль якості під час виробництва.', `
<article class="slab info-page">${crumb('../', producer)}<h1>Про виробника</h1>
<p class="intro">Ми — магазин «${e(config.siteName)}», продавець продукції виробника РКП у Чернігові.</p>
<p>«Рибкопродукт» працює на українському ринку з 2008 року. Компанія позиціонує себе як найбільший виробник червоної ікри в Україні. За даними РКП, асортимент налічує близько 60 найменувань під більш ніж 10 торговими марками. Серед них — «Червоне Золото», «Золота Унція» та «Острів».</p>
<section><h2>Походження та контроль якості</h2>
<p>РКП використовує сировину з Аляски та Скандинавії. За інформацією виробника, на виробництві застосовують озонування для підтримання стерильності, а під час перевезення контролюють температуру, щоб зберегти холодовий ланцюг.</p></section>
<section id="certificates"><h2>Сертифікати виробника</h2>
<p>Система безпечності харчових продуктів сертифікована за FSSC 22000 (включає ISO 22000:2018 та ISO/TS 22002-1).</p>
${certificateContent}</section>
</article>`, [breadcrumbSchema(producer)], { query: 'виробник ікри Рибкопродукт' });

entry(warrantyPath, 'Гарантія натуральності ікри', 'Умови гарантії натуральності ікри в магазині «' + config.siteName + '»: коли звертатися, як провести незалежну експертизу та в який строк повертаємо кошти.', `
<article class="slab info-page">${crumb('../', warranty)}<h1>Умови гарантії натуральності</h1>
<p class="intro">${warrantyPromise}</p>
<section><h2>Як скористатися гарантією</h2>
<p>Гарантія поширюється на ікру, придбану в магазині «${e(config.siteName)}».</p>
<ol class="warranty-steps">
<li>Збережіть банку з етикеткою та номер замовлення.</li>
<li>Зверніться до нас протягом 14 днів із дня отримання замовлення.</li>
<li>Передайте ікру на експертизу до незалежної акредитованої лабораторії та надайте нам її висновок.</li>
<li>Якщо висновок підтвердить, що ікра не натуральна, ми повернемо 100% її вартості й компенсуємо витрати на експертизу протягом 7 днів після отримання висновку.</li>
</ol><p>Звернутися щодо гарантії: ${phoneLink}</p><p>${link('../', producerPath + '#certificates', 'Переглянути сертифікати виробника')}</p>
<p>${e(config.localDeliveryTerms)}</p></section></article>`, [breadcrumbSchema(warranty)], { query: 'гарантія натуральності ікри' });

function filter(name, label, values, display) {
  return '<label>' + label + '<select name="' + name + '"><option value="">Усі</option>' +
    values.map(value => '<option value="' + e(value) + '">' + e(display(value)) + '</option>').join('') + '</select></label>';
}
const values = key => [...new Set(products.map(p => p[key]))].sort((a, b) =>
  typeof a === 'number' ? a - b : a.localeCompare(b, 'uk'));
entry('katalog/', 'Каталог червоної ікри в Чернігові', 'Порівняйте ціни на ікру форелі, горбуші, кети, нерки, кижуча, чавичі та щуки. Фільтруйте за вагою й маркою та замовляйте доставку в Чернігові або по Україні.', `
<div class="slab">${crumb('../', catalog)}<h1>Каталог червоної ікри</h1>${varietyLinks('../')}
<form id="filters" class="filters" ${products.length ? '' : 'hidden'}>
${filter('species', 'Вид ікри', values('species'), v => species[v])}
${filter('brand', 'Торгова марка', values('brand'), v => v)}
${filter('weight', 'Фасування', values('weight'), v => v + ' г')}
${filter('packaging', 'Упаковка', values('packaging'), v => packaging[v])}
${filter('availability', 'Наявність', values('availability'), v => stocks[v])}
<label>Ціна від, грн<input type="number" name="min" min="0" step="0.01"></label>
<label>Ціна до, грн<input type="number" name="max" min="0" step="0.01"></label>
<label>Сортування<select name="sort"><option value="">За замовчуванням</option><option value="asc">Від дешевших</option><option value="desc">Від дорожчих</option><option value="name">За назвою</option></select></label>
<button type="reset" class="button secondary">Скинути фільтри</button></form>
<p id="results" role="status">${products.length ? 'Товарів: ' + products.length : 'Готуємо каталог. Товари з’являться після оновлення асортименту.'}</p>
<div id="catalog" class="grid">${grid(products, '../')}</div></div>`, [
  schema('ItemList', { itemListElement: products.map((p, i) => ({ '@type': 'ListItem', position: i + 1,
    url: absolute(productPath(p)), name: p.name })) }), breadcrumbSchema(catalog)
], { query: 'червона ікра Чернігів ціни' });

const deliveryTitle = 'Доставка ікри по Чернігову';
const deliveryCrumbs = [...home, [deliveryPath, deliveryTitle]];
const deliveryFaq = [
  ['Де доступний самовивіз?', 'Самовивіз за адресою Чернігів, вул. Мстиславська, 67, щодня 9:00–20:00. Оплата при отриманні.'],
  ['Коли кур’єр і Нова Пошта безкоштовні?', 'Коли сумарна вага банок у кошику становить щонайменше 1000 г. Для доставки потрібна передоплата на картку; реквізити надішлемо після підтвердження.'],
  ['Що робити, якщо в кошику менше 1 кг?', 'Можна оформити самовивіз. Додайте товари до 1000 г, щоб стали доступні безкоштовні кур’єр по Чернігову або Нова Пошта.']
];
entry(deliveryPath, deliveryTitle, 'Самовивіз і безкоштовна доставка ікри по Чернігову та Україні: кур’єр або Нова Пошта від 1 кг. Передоплата на картку після підтвердження. Деталі — тут.', `
<article class="slab info-page">${crumb('../', deliveryCrumbs)}<h1>${deliveryTitle}</h1>
<p class="intro">Самовивіз: ${e(config.pickupAddress)}, щодня 9:00–20:00. Оплата при отриманні.</p>
<p>Кур’єр по Чернігову та Нова Пошта по Україні — безкоштовно, якщо сумарна вага продукції в кошику не менша за 1000 г. Для цих способів доставки — передоплата на картку; реквізити надсилаємо після підтвердження замовлення.</p>
<p>Для замовлення меншої ваги доступний самовивіз. У кошику показуємо, скільки грамів залишилося до безкоштовної доставки.</p>
<p>${link('../', 'katalog/', 'Перейти до каталогу')}</p>${contactLinks()}</article>
<section class="slab"><h2>Запитання про доставку</h2>${faqBody(deliveryFaq, '../')}</section>`,
[breadcrumbSchema(deliveryCrumbs), faqSchema(deliveryFaq)], { query: 'ікра з доставкою Чернігів' });

const seasonTitle = 'Ікра на Новий рік у Чернігові';
const seasonCrumbs = [...home, [seasonPath, seasonTitle]];
entry(seasonPath, seasonTitle, 'Оберіть ікру на Новий рік у Чернігові: популярні фасування, подарункові набори й ідеї для закусок. Дізнайтеся, коли оформити замовлення до свят.', `
<article class="slab info-page">${crumb('../', seasonCrumbs)}<h1>${seasonTitle}</h1>
<p>Для святкового столу зручно поєднати кілька видів ікри, а для подарунка — обрати готовий набір. Подавайте ікру на канапках, у тарталетках або окремо для дегустації.</p>
<h2>Коли замовити до свят</h2><p>${config.newYearOrderDeadline ?
  'Оформіть замовлення до ' + e(config.newYearOrderDeadline) + '.' :
  'Оформіть замовлення завчасно. Крайній термін залежить від дати отримання та способу доставки, тому уточніть його під час підтвердження.'}</p>
<p>${link('../', deliveryPath, 'Умови доставки в Чернігові та по Україні')}</p></article>
<section class="slab"><h2>Подарункові набори ікри</h2><div class="grid">${setCards('../')}</div></section>
<section class="slab"><h2>Хіти для святкового столу</h2><div class="grid">${grid(hits, '../')}</div></section>`,
[breadcrumbSchema(seasonCrumbs)], { query: 'ікра на Новий рік, подарунковий набір ікри' });

for (const [key, [, name, paragraphs, serving]] of Object.entries(varieties)) {
  const words = paragraphs.join(' ').split(/\s+/).length;
  if (words < 120 || words > 200) throw new Error('Текст категорії ' + key + ' має містити 120–200 слів.');
  const path = varietyPath(key);
  const heading = 'Ікра ' + name + ' в Чернігові';
  const entries = [...catalog, [path, heading]];
  const selected = products.filter(p => p.species === key);
  const description = snippet(heading + ': ціни, фасування та наявність. ' + serving, [
    'Самовивіз у Чернігові. Кур’єр і Нова Пошта безкоштовно від 1 кг.', 'Доставка по Україні Новою поштою від 1 кг.',
    'Порівняйте доступні фасування.', 'Дізнайтеся умови самовивозу й доставки.'
  ]);
  entry(path, heading + ' — ціни', description, `
<article class="slab info-page">${crumb('../', entries)}<h1>${heading}</h1>
${paragraphs.map(p => '<p>' + e(p) + '</p>').join('')}</article>
<section class="slab"><h2>Фасування та ціни</h2><div class="grid">${grid(selected, '../')}</div></section>
<section class="slab"><h2>Самовивіз і доставка</h2><p>${e(config.localDeliveryTerms)}</p>
<p>${link('../', deliveryPath, 'Переглянути умови доставки')}</p></section>`, [breadcrumbSchema(entries)],
  { query: 'ікра ' + name + ' Чернігів ціна' });
}

for (const p of products) {
  const path = productPath(p);
  const [, variety, , serving] = varieties[p.species];
  const entries = [...catalog, [varietyPath(p.species), 'Ікра ' + variety], [path, p.name]];
  const pack = p.packaging === 'metal' ? 'ж/б' : p.packaging === 'plastic' ? 'пл/к' : 'ск/б';
  const title = 'Ікра ' + variety + ' «' + p.brand + '» ' + p.weight + ' г, ' + pack;
  const description = snippet('Ікра ' + variety + ' «' + p.brand + '», ' + p.weight + ' г. ' + packaging[p.packaging] +
    '. Ціна й наявність у каталозі. Доставка в Чернігові та Новою поштою.', [
    'Для святкового столу.', 'Зручно для закусок.', 'Дивіться умови доставки.'
  ]);
  const productCopy = p.description || ('Ікра ' + variety + ' від «' + p.brand + '» у фасуванні ' + p.weight + ' г. ' +
    serving + ' Зберігайте за температури, зазначеної виробником на етикетці.');
  const availability = { in_stock: 'InStock', preorder: 'BackOrder' }[p.availability];
  const related = products.filter(item => item.id !== p.id).sort((a, b) =>
    Number(b.species === p.species) - Number(a.species === p.species) ||
    Number(b.availability === 'in_stock') - Number(a.availability === 'in_stock')).slice(0, 4);
  entry(path, title, description, `<div class="slab">${crumb('../../', entries)}
<div class="product">${image(p, '../../', true)}<div><h1>${e(p.name)}</h1><p class="product-meta">${e(p.brand)}</p>
<p class="stock ${p.availability === 'in_stock' ? 'in-stock' : 'preorder'}">${stocks[p.availability]}</p><p class="price">${money(p.price)}</p>${add(p.id, true, 'product', p.availability)}${warrantyLink('../../')}
<dl>${[['Вид ікри', species[p.species]], ['Торгова марка', p.brand], ['Фасування', p.weight + ' г'], ['Упаковка', packaging[p.packaging]], ['Температурний режим', p.temperature]].map(([label, value]) => '<div><dt>' + label + '</dt><dd>' + e(value) + '</dd></div>').join('')}</dl><p class="product-copy">${e(productCopy)}</p></div></div>
</div>${related.length ? '<section class="slab"><h2>Схожі товари</h2><div class="grid">' + grid(related, '../../') + '</div></section>' : ''}`,
  [schema('Product', {
    name: p.name, sku: p.id, description: p.description || description, url: absolute(path), brand: { '@type': 'Brand', name: p.brand },
    ...(p.photo && p.photo_source !== 'similar' && { image: absolute(p.photo.large) }),
    ...(p.price != null && { offers: { '@type': 'Offer', price: p.price, priceCurrency: 'UAH',
      url: absolute(path), ...(availability && { availability: 'https://schema.org/' + availability }) } })
  }), breadcrumbSchema(entries)], { image: p.photo_source === 'similar' ? undefined : p.photo?.large,
    query: 'ікра ' + variety + ' ' + p.brand + ' ' + p.weight + ' г ' + pack + ' Чернігів' });
}

entry('koshyk/', 'Кошик і оформлення замовлення', 'Перевірте вибрані товари та їхню кількість, залиште контактні дані й оформіть замовлення ікри. Тут можна переглянути загальну вартість перед підтвердженням.', `
<div class="slab">${crumb('../', basket)}<h1>Кошик</h1>${contactLinks()}<noscript><p>Увімкніть JavaScript, щоб оформити замовлення.</p></noscript>
<p id="order-result" role="status" tabindex="-1"></p>
<div id="order-fallback" class="contact-links" hidden>
${config.phone ? '<a class="button secondary" href="tel:' + e(config.phone) + '">Зателефонувати</a>' : ''}
${config.telegram ? '<a class="button secondary" href="' + e(config.telegram) + '">Написати в Telegram</a>' : ''}
${config.viber ? '<a class="button secondary" href="' + e(config.viber) + '">Написати у Viber</a>' : ''}
</div>
<div class="checkout"><section aria-label="Товари у кошику"><div id="cart-items"></div><p id="cart-total"></p><p id="shipping-hint" class="shipping-hint"></p><div id="shipping-progress" class="shipping-progress" role="meter" aria-label="Вага для безкоштовної доставки" aria-valuemin="0" aria-valuemax="1000" aria-valuenow="0"><span></span></div></section>
<form id="order" class="order" hidden><h2>Оформлення замовлення</h2>
<label>Ім’я<input name="name" autocomplete="given-name" required maxlength="80"></label>
<label>Телефон<input name="phone" type="tel" inputmode="tel" autocomplete="tel" placeholder="+380 (00) 000-00-00" required maxlength="32"></label>
<label>Спосіб доставки<select name="delivery" required>
<option value="pickup">Самовивіз</option>
<option value="chernihiv" data-paid-delivery disabled>Кур’єр по Чернігову — безкоштовно від 1 кг</option>
<option value="novaposhta" data-paid-delivery disabled>Нова Пошта по Україні — безкоштовно від 1 кг</option>
</select></label>
<p data-delivery="pickup" class="pickup-info">${e(config.pickupAddress)}, щодня 9:00–20:00. Оплата при отриманні.</p>
<fieldset data-delivery="chernihiv">
<label>Адреса в Чернігові<input name="address" autocomplete="street-address" required maxlength="180"></label>
</fieldset>
<fieldset data-delivery="novaposhta" disabled hidden>
<label>Місто<input name="city" autocomplete="address-level2" required maxlength="100"></label>
<label>Відділення Нової пошти<input name="npBranch" required maxlength="120"></label>
</fieldset>
<label>Бажаний час (необов’язково)<input name="time" maxlength="60"></label>
<p id="payment-hint" class="payment-hint">Оплата при отриманні під час самовивозу.</p>
<label>Коментар<textarea name="comment" rows="3" maxlength="400"></textarea></label>
<div hidden><label>Вебсайт<input name="website" tabindex="-1" autocomplete="off"></label></div>
<button class="button primary">Надіслати замовлення</button><p class="order-terms">Надсилаючи замовлення, ви погоджуєтесь з <a href="../umovy-prodazhu/">Умовами продажу</a> та <a href="../polityka-konfidentsiinosti/">Політикою конфіденційності</a>.</p></form></div></div>`, [breadcrumbSchema(basket)], { noindex: true, query: 'оформлення замовлення ікри' });

const privacyPath = 'polityka-konfidentsiinosti/';
const termsPath = 'umovy-prodazhu/';
entry(privacyPath, 'Політика конфіденційності', 'Дізнайтеся, які контактні дані ми отримуємо під час замовлення, як використовуємо cookies та аналітику і як попросити видалити ваші дані сайту.', `<div class="slab"><h1>Політика конфіденційності</h1><p>Під час оформлення замовлення ми отримуємо ваше ім’я, номер телефону та адресу доставки або дані пункту видачі. Ці дані потрібні, щоб підтвердити замовлення, зв’язатися з вами та доставити його.</p><p>Дані замовлення обробляються в Supabase. Для сповіщення працівників магазину про нові замовлення використовується Telegram. Ми не продаємо ваші персональні дані.</p><p>Сайт зберігає кошик і ваш вибір щодо cookies у браузері. За вашою згодою Google Analytics та Google Ads використовують cookies і подібні технології для вимірювання відвідувань та ефективності реклами. Ви можете змінити вибір у налаштуваннях браузера.</p><p>Щоб попросити видалити дані замовлення, напишіть нам на <a href="tel:${e(config.phone)}">${e(config.phoneDisplay || config.phone)}</a> або в <a href="${e(config.telegram)}">Telegram</a>. Для пошуку замовлення вкажіть його номер і телефон.</p><p>Контакт магазину: <a href="tel:${e(config.phone)}">${e(config.phoneDisplay || config.phone)}</a>.</p></div>`, [], { query: 'політика конфіденційності магазину ікри' });
entry(termsPath, 'Умови продажу', 'Умови самовивозу, доставки, оплати, повернення та зберігання червоної ікри в магазині у Чернігові. Ознайомтеся з правилами магазину перед купівлею.', `<div class="slab"><h1>Умови продажу</h1><h2>Отримання замовлення</h2><p>Самовивіз: Чернігів, вул. Мстиславська, 67, щодня з 9:00 до 20:00. При самовивозі оплата при отриманні.</p><p>Доставка кур’єром у Чернігові та Новою поштою по Україні безкоштовна для замовлень від 1 кг. Для доставки потрібна передоплата на картку після підтвердження замовлення; реквізити надішлемо після підтвердження.</p><h2>Повернення та гарантія</h2><p>Умови гарантії натуральності та повернення описані на сторінці <a href="../harantiia/">Гарантія натуральності</a>.</p><h2>Зберігання</h2><p>Зберігайте ікру в холодильнику за температури, зазначеної виробником на етикетці. Після відкриття дотримуйтеся умов і строку зберігання для відкритої упаковки, вказаних виробником.</p></div>`, [], { query: 'умови продажу ікри та доставки' });

const missing = [...home, ['404.html', 'Сторінку не знайдено']];
entry('404.html', 'Сторінку не знайдено', 'Ця сторінка недоступна. Відкрийте каталог магазину «' + config.siteName + '», щоб знайти потрібний вид ікри та переглянути доступні ціни й фасування.', '<div class="slab">' + crumb(absolute(''), missing) + '<h1>Сторінку не знайдено</h1><p>Перейдіть на головну або відкрийте каталог.</p><a class="button" href="' + e(absolute('katalog/')) + '">До каталогу</a></div>', [breadcrumbSchema(missing)], { noindex: true, query: '—' });

const seoRows = [];
const badLengths = [];
for (const [path, page] of pages) {
  const length = page.description.length;
  if (page.title.length > 60 || length < 140 || length > 160) badLengths.push('/' + path + ' (' + page.title.length + '/' + length + ')');
  const [, h1] = page.body.match(/<h1>([^<]+)<\/h1>/) ?? [];
  seoRows.push(['/' + path, page.query, page.title, page.description, h1]);
}
if (badLengths.length) throw new Error('Довжина SEO (title/description): ' + badLengths.join(', '));
for (const field of [2, 3, 4]) {
  if (seoRows.some(row => !row[field]) || new Set(seoRows.map(row => row[field])).size !== seoRows.length) {
    throw new Error('Відсутні або повторюються SEO-дані: ' + ['URL', 'запит', 'title', 'description', 'H1'][field]);
  }
}

const outputRoot = resolve('dist');
const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));
if (outputRoot !== resolve(projectRoot, 'dist')) throw new Error('Запустіть збірку з кореня проєкту.');
await rm(outputRoot, { recursive: true, force: true });
await mkdir(outputRoot, { recursive: true });
await cp('src/style.css', 'dist/style.css');
await cp('src/app.mjs', 'dist/app.mjs');
await writeFile('dist/analytics.mjs', (await readFile('src/analytics.mjs', 'utf8'))
  .replace("from '../config.mjs'", "from './config.mjs'"));
await cp('src/shop.mjs', 'dist/shop.mjs');
await mkdir('dist/assets/js', { recursive: true });
await cp('assets/js/roe.js', 'dist/assets/js/roe.js');
await mkdir('dist/fonts', { recursive: true });
for (const [family, weights] of [['playfair-display', [700]], ['onest', [400, 500, 600]]]) {
  for (const subset of ['cyrillic', 'latin']) {
    for (const weight of weights) {
      const file = family + '-' + subset + '-' + weight + '-normal.woff2';
      await cp('node_modules/@fontsource/' + family + '/files/' + file, 'dist/fonts/' + file);
    }
  }
}
await cp('config.mjs', 'dist/config.mjs');
await mkdir('dist/media/products', { recursive: true });
await cp('assets/brand', 'dist/' + brandPath, { recursive: true });
// Keep the Google Search favicon at a stable site-root URL. ICO stores PNG frames
// so the 16, 32, and 48 pixel images retain their full color and transparency.
const icoFrames = await Promise.all([16, 32, 48].map(async size => ({
  size,
  data: await sharp('assets/brand/icon-192.png').resize(size, size).png().toBuffer()
})));
const ico = Buffer.alloc(6 + icoFrames.length * 16 + icoFrames.reduce((sum, frame) => sum + frame.data.length, 0));
ico.writeUInt16LE(0, 0);
ico.writeUInt16LE(1, 2);
ico.writeUInt16LE(icoFrames.length, 4);
let icoOffset = 6 + icoFrames.length * 16;
icoFrames.forEach(({ size, data }, index) => {
  const entry = 6 + index * 16;
  ico[entry] = size === 256 ? 0 : size;
  ico[entry + 1] = size === 256 ? 0 : size;
  ico[entry + 2] = 0;
  ico[entry + 3] = 0;
  ico.writeUInt16LE(1, entry + 4);
  ico.writeUInt16LE(32, entry + 6);
  ico.writeUInt32LE(data.length, entry + 8);
  ico.writeUInt32LE(icoOffset, entry + 12);
  data.copy(ico, icoOffset);
  icoOffset += data.length;
});
await writeFile('dist/favicon.ico', ico);
await mkdir('dist/assets/textures', { recursive: true });
for (const file of ['frost.webp', 'ice-crushed.webp', 'tin-brushed.webp', 'roe-outline.svg']) {
  await cp('assets/textures/' + file, 'dist/assets/textures/' + file);
}
await writeFile('dist/site.webmanifest', JSON.stringify({
  name: config.siteName,
  short_name: config.shortName,
  icons: [192, 512].map(size => ({
    src: brandPath + 'icon-' + size + '.png', sizes: size + 'x' + size, type: 'image/png'
  })),
  theme_color: '#2a1a14',
  background_color: '#fbf6ee'
}, null, 2) + '\n');
for (const [, file, thumbnail] of certificates.filter(([, file]) => file)) {
  await mkdir('dist/media/certificates', { recursive: true });
  await cp('assets/certificates/' + file, 'dist/media/certificates/' + file);
  if (thumbnail && thumbnail !== file) await cp('assets/certificates/' + thumbnail, 'dist/media/certificates/' + thumbnail);
}
for (const file of ['hero.jpg', 'hero-small.jpg', 'og-image.jpg']) await cp('assets/' + file, 'dist/media/' + file);
for (const path of photoFiles) await cp(photoAsset(path), 'dist/' + path);
await writeFile('dist/products.json', json(products.map(({ id, slug, name, species, brand, weight, packaging, temperature,
  price, availability, photo, photo_source, description, alt, visible }) => ({
  id, slug, name, species, brand, weight, packaging, temperature, price, availability, visible,
  photo: photo ? { small: photo.small, large: photo.large,
    multiplySmall: photo_source !== 'placeholder' && opaqueLightPhotos.has(photo.small) } : null,
  ...(description && { description }), ...(alt && { alt })
}))));
for (const [path, page] of pages) {
  const prefix = path === '404.html' ? absolute('') : '../'.repeat(path.split('/').length - 1);
  const brand = e(prefix + brandPath);
  const logo = (file, lazy = false) => '<img src="' + brand + file + '" alt="' + e(brandAlt) + '" width="455" height="106"' + (lazy ? ' loading="lazy"' : '') + '>';
  const description = e(page.description);
  const title = e(page.title);
  const analyticsProduct = products.find(p => productPath(p) === path);
  const analyticsHead = `<script async src="https://www.googletagmanager.com/gtag/js?id=G-TCSPL6WXF6"></script>
<script>
window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('consent', 'default', {ad_storage: 'granted', ad_user_data: 'granted', ad_personalization: 'granted', analytics_storage: 'granted'});
gtag('consent', 'default', {ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied', analytics_storage: 'denied', region: ['AT','BE','BG','HR','CY','CZ','DK','EE','FI','FR','DE','GR','HU','IS','IE','IT','LV','LI','LT','LU','MT','NL','NO','PL','PT','RO','SK','SI','ES','SE','CH','GB'], wait_for_update: 500});
if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
  window['ga-disable-G-TCSPL6WXF6'] = true;
  window['ga-disable-AW-18593348016'] = true;
}
gtag('js', new Date());
gtag('config', 'G-TCSPL6WXF6');
gtag('config', 'AW-18593348016');
</script>`;
  const output = path.endsWith('.html') ? path : path + 'index.html';
  await mkdir('dist/' + output.slice(0, output.lastIndexOf('/') + 1), { recursive: true });
  await writeFile('dist/' + output, `<!doctype html><html lang="uk"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
${analyticsHead}
<title>${title}</title><meta name="description" content="${description}">
<meta property="og:site_name" content="${e(config.siteName)}">
<meta name="theme-color" content="#2a1a14">
<link rel="icon" href="/favicon.ico" sizes="48x48">
<link rel="icon" href="/${brandPath}icon-96.png" type="image/png" sizes="96x96">
<link rel="icon" href="/${brandPath}favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/${brandPath}apple-touch-icon.png">
<link rel="manifest" href="${e(prefix)}site.webmanifest">
${page.noindex ? '<meta name="robots" content="noindex">' : ''}
${base ? '<link rel="canonical" href="' + e(absolute(path)) + '"><meta property="og:url" content="' + e(absolute(path)) + '">' : ''}
<meta property="og:locale" content="uk_UA"><meta property="og:type" content="${path.startsWith('produkt/') ? 'product' : 'website'}"><meta property="og:title" content="${title}"><meta property="og:description" content="${description}"><meta property="og:image" content="${e(absolute(page.image || 'media/og-image.jpg'))}">
<link rel="preload" href="${e(prefix)}fonts/playfair-display-cyrillic-700-normal.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="${e(prefix)}style.css">
<script>window.__ikraProduct=${json(analyticsProduct ? (({ id, name, price }) => ({ id, name, price }))(analyticsProduct) : null)};</script>
<script type="module" src="${e(prefix)}analytics.mjs"></script><script type="module" src="${e(prefix)}app.mjs"></script>
${path === '' ? '<script defer src="assets/js/roe.js"></script>' : ''}
<script type="application/ld+json">${json([{ ...organization, logo: base ? absolute(organizationLogo) : prefix + organizationLogo }, ...page.structured])}</script></head><body>
<a class="skip" href="#main">До вмісту</a><header><div class="wrap header"><a class="wordmark" href="${e(prefix || './')}">${logo('logo-compact.svg')}</a><nav aria-label="Головна навігація">${link(prefix, 'katalog/', 'Каталог')}${link(prefix, deliveryPath, 'Доставка')}${link(prefix, producerPath, 'Про виробника')}</nav>${headerPhone}<a class="basket" href="${e(prefix)}koshyk/">Кошик <span id="cart-count">0</span></a></div></header>
<main id="main">${page.body}</main><footer><div class="wrap footer"><span class="wordmark">${logo('logo-dark.svg', true)}</span><nav aria-label="Інформація">${link(prefix, producerPath, 'Про виробника')}${link(prefix, deliveryPath, 'Доставка')}${link(prefix, '#faq', 'Запитання')}${link(prefix, termsPath, 'Умови продажу')}${link(prefix, privacyPath, 'Політика конфіденційності')}</nav>${contactLinks()}<nav class="footer-varieties" aria-label="Види ікри">${varietyLinks(prefix)}</nav><p class="footer-delivery">${e(config.localDeliveryTerms)}</p><small>© 2026 ${e(config.siteName)}</small></div></footer><aside id="cookie-consent" class="cookie-consent" hidden aria-label="Налаштування cookies"><p>Ми використовуємо cookies для аналітики та покращення роботи сайту.</p><div><button class="button primary" data-consent="accept">Прийняти</button><button class="button secondary" data-consent="reject">Відхилити</button></div></aside><p id="notice" class="notice" role="status"></p><span id="cart-status" class="sr-only" role="status" aria-live="polite" aria-atomic="true"></span></body></html>`);
}
const indexable = [...pages].filter(([, page]) => !page.noindex);
await writeFile('dist/sitemap.xml', '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' +
  (base ? indexable.map(([path]) => '<url><loc>' + e(absolute(path)) + '</loc><lastmod>' + e(config.seoLastModified) + '</lastmod></url>').join('') : '') + '</urlset>\n');
await writeFile('dist/robots.txt', base ? 'User-agent: *\nAllow: /\nSitemap: ' + absolute('sitemap.xml') + '\n' : 'User-agent: *\nDisallow: /\n');
if (base) await writeFile('dist/CNAME', base.hostname + '\n');
await writeFile('dist/.nojekyll', '');
if (process.argv.includes('--seo-report')) {
  const cells = row => '| ' + row.map(cell => cell.replaceAll('|', '\\|')).join(' | ') + ' |';
  await writeFile('docs/seo.md', [
    '# SEO-карта ikra.fun', '', 'Бренд: «' + config.siteName + '». Мова сайту — українська. Основний ринок — Чернігів.', '',
    'Кошик і сторінка 404 закриті для індексації.', '',
    cells(['Сторінка', 'Основний запит', 'Title', 'Description', 'H1']),
    '| --- | --- | --- | --- | --- |',
    ...seoRows.map(cells), '',
    'Джерела для загальних відомостей про лососеву ікру: [Alaska Seafood Marketing Institute](https://www.alaskaseafood.org/wp-content/uploads/201312-Sustainable-Salmon-Roe-Brochure.pdf), [University of Alaska Fairbanks](https://www.uaf.edu/ces/publications/database/food/salmon-roe-caviar.php).', ''
  ].join('\n'));
}
console.log('Зібрано сторінок:', pages.size);
