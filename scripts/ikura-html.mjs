import { parse } from 'parse5';
import { ikuraUrl } from './ikura-http.mjs';

const typeNames = {
  trout: /форел[ьіїи]/iu, pink: /горбуш[аіи]/iu, chum: /(?:^|\s)кет[аиі](?:\s|$)/iu,
  chinook: /чав[иы]ч[аіи]/iu, sockeye: /нерк[аиі]/iu, coho: /кижуч(?:а)?/iu,
  pike: /щук[аиі]/iu, cod: /тріск[аиі]|треск[аи]/iu, pollock: /минта[йяю]/iu,
  sturgeon: /осетр|осетров|б[еі]луг/iu
};
const brands = {
  'Червоне Золото': ['Красное Золото'], 'Золота Унція': ['Золотая унция'],
  'Острів': ['Остров'], 'Сільвер Бей': ['Сильвер Бей', 'Silver Bay'],
  'Високий Посол': ['Высокий посол'], 'Рибкопродукт': ['Рыбкопродукт']
};
const jarTypes = {
  glass: /скляна\s+банка|стеклянная\s+банка|(?:ск|ст)\s*\/\s*б/i,
  plastic: /пластикова\s+банка|пластиковая\s+банка|пл\s*\/\s*б/i,
  metal: /жерстяна\s+банка|жестяная\s+банка|ж\s*\/\s*б/i
};
export const normalize = value => String(value ?? '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const space = value => String(value ?? '').replace(/\s+/g, ' ').trim();
const attr = (node, key) => node.attrs?.find(a => a.name === key)?.value;
function* walk(node) {
  yield node;
  for (const child of node.childNodes ?? []) yield* walk(child);
}
function content(node) {
  if (!node || ['script', 'style', 'template'].includes(node.tagName)) return '';
  return node.value ?? (node.childNodes ?? []).map(content).join(' ');
}
const attrGrammar = /(?:вид\s+(?:ікри|икры)|тип\s+(?:пакування|упаковки|паковання)|вага|вес|наявність|наличие|торгова\s+марка|торговая\s+марка)\s*:/iu;
function field(page, labels) {
  const match = new RegExp('(?:' + labels + ')\\s*:\\s*', 'iu').exec(page);
  if (!match) return '';
  const rest = page.slice(match.index + match[0].length);
  return rest.split(attrGrammar)[0].split(/склад:|состав:|термін придатності|срок годности|оплата\s+(?:і|и)\s+доставка/iu)[0].trim();
}
function weights(value) {
  return [...String(value ?? '').matchAll(/(?<![\d.,])(\d+(?:[.,]\d+)?)\s*(кг|г|kg|g)(?![\p{L}])/giu)]
    .map(([, amount, unit]) => Number(amount.replace(',', '.')) * (/кг|kg/i.test(unit) ? 1000 : 1));
}
function species(value) {
  const hits = Object.entries(typeNames).filter(([, pattern]) => pattern.test(normalize(value)));
  return hits.length === 1 ? hits[0][0] : null;
}
function stock(value) {
  const text = normalize(value);
  if (/outofstock|soldout|discontinued|немає в наявності|нет в наличии|очікується/.test(text)) return 'out';
  if (/instock|(?:у|в) наявності|в наличии/.test(text)) return 'in';
  return 'unknown';
}
function amount(value) {
  const cleaned = space(value).replace(/(?:грн\.?|₴|UAH)/gi, '').replace(/\s+/g, '').replace(',', '.');
  return /^\d+(?:\.\d{1,2})?$/.test(cleaned) && Number(cleaned) > 0 ? Number(cleaned) : null;
}

function structured(nodes) {
  function* objects(value) {
    if (Array.isArray(value)) {
      for (const child of value) yield* objects(child);
    } else if (value && typeof value === 'object') {
      yield value;
      yield* objects(value['@graph']);
    }
  }
  return nodes.filter(n => n.tagName === 'script' && attr(n, 'type')?.toLowerCase() === 'application/ld+json')
    .flatMap(n => {
      try { return [...objects(JSON.parse(n.childNodes.map(c => c.value ?? '').join('')))]; }
      catch { return []; }
    }).filter(value => [value['@type']].flat().some(type => /(?:^|\/)Product$/i.test(type ?? '')));
}

const categoryRoute = /\/(?:ohlazhdennaya-ikra|okholodzhena-ikra|oholodzhena-ikra|krasnaya-fresh-ikra|chervona-fresh-ikra|sushenaya-ryba-i-ikra|sushena-ryba-ta-ikra|chernaya-ikra|chorna-ikra)(?:\/(?:page[-/]?)?\d+)?\/?$/i;
const productRoute = /(?:ikra|ikry|caviar)/i;
export function listing(html, pageUrl) {
  const categories = new Set();
  const cards = new Set();
  const current = new URL(pageUrl);
  const pageKeys = new Set(['page', 'p', 'PAGEN_1', 'per_page']);
  for (const node of walk(parse(html))) {
    if (!['a', 'link'].includes(node.tagName)) continue;
    const url = ikuraUrl(attr(node, 'href'), pageUrl);
    if (!url) continue;
    const label = space(content(node));
    const queryKeys = [...url.searchParams.keys()];
    const pagination = queryKeys.length && queryKeys.every(key => pageKeys.has(key) && /^\d+$/.test(url.searchParams.get(key)));
    const next = /^(?:next|prev)$/i.test(attr(node, 'rel') ?? '');
    const category = categoryRoute.test(url.pathname) ||
      (!weights(label).length && /^(?:[●•]\s*)?(?:охлажденная икра|охолоджена ікра|красная фреш.икра|червона фреш.ікра|сушеная рыба и икра|сушена риба та ікра|черная икра|чорна ікра)$/iu.test(label));
    if ((category && (!url.search || pagination)) ||
        (url.pathname === current.pathname && (pagination || next))) categories.add(url.href);
    else if (node.tagName === 'a' && !queryKeys.length && !category &&
        (productRoute.test(url.pathname) || /ікр[аи]|икр[аы]/iu.test(label)) &&
        (weights(label).length || species(label) || /\/(?:product|tovar)\//i.test(url.pathname))) cards.add(url.href);
  }
  return { categories, cards };
}

function photoUrls(nodes, meta, ld, name, pageUrl) {
  const images = new Map();
  function add(value, rank) {
    const url = ikuraUrl(value, pageUrl);
    if (!url || !/\.(?:avif|jpe?g|png|webp)(?:$|\?)/i.test(url.pathname + url.search)) return;
    images.set(url.href, Math.max(rank, images.get(url.href) ?? 0));
  }
  for (const value of [ld?.image ?? []].flat()) add(typeof value === 'object' ? value?.contentUrl ?? value?.url : value, 650);
  add(meta('og:image'), 600);
  for (const n of nodes.filter(n => n.tagName === 'img')) {
    const alt = normalize(attr(n, 'alt'));
    if (!alt || !normalize(name).includes(alt) || alt.length < 12) continue;
    const src = attr(n, 'data-src') || attr(n, 'src');
    add(src, 200);
    if (n.parentNode?.tagName === 'a') add(attr(n.parentNode, 'href'), 4000);
    add(attr(n, 'data-original'), 3000);
    add(attr(n, 'data-zoom-image'), 4000);
    for (const parent of [n, n.parentNode?.tagName === 'picture' ? n.parentNode : null].filter(Boolean)) {
      const candidates = [parent, ...(parent.childNodes ?? []).filter(child => child.tagName === 'source')];
      for (const candidate of candidates) for (const part of (attr(candidate, 'srcset') ?? '').split(',')) {
        const [url, width] = part.trim().split(/\s+/);
        add(url, 750 + Math.min(3000, parseInt(width, 10) || 0));
      }
    }
  }
  return [...images].sort((a, b) => b[1] - a[1]).map(([url]) => url);
}

export function productCard(html, finalUrl) {
  const tree = parse(html);
  const nodes = [...walk(tree)];
  const meta = property => attr(nodes.find(n => [attr(n, 'property'), attr(n, 'name'), attr(n, 'itemprop')].includes(property)) ?? {}, 'content');
  const ldItems = structured(nodes);
  const heading = space(content(nodes.find(n => n.tagName === 'h1')));
  const ld = ldItems.find(p => normalize(p.name) === normalize(heading)) ?? (ldItems.length === 1 ? ldItems[0] : undefined);
  const name = heading || space(ld?.name);
  const page = space(content(nodes.find(n => n.tagName === 'body') ?? tree));
  const details = page.match(/характеристики\s*([\s\S]*?)(?:оплата\s+(?:і|и)\s+доставка|$)/iu)?.[1] ?? page;
  const titleWeight = [...new Set(weights(name))];
  const detailWeight = [...new Set(weights(field(details, 'вага|вес')))];
  const weight = detailWeight.length > 1 || titleWeight.length > 1 ||
    (detailWeight.length && titleWeight.length && detailWeight[0] !== titleWeight[0]) ? null : detailWeight[0] ?? titleWeight[0] ?? null;
  const titleSpecies = species(name);
  const detailSpecies = species(field(details, 'вид\\s+(?:ікри|икры)'));
  const pack = field(details, 'тип\\s+(?:упаковки|пакування|паковання)') || name;
  const packaging = /вакуум|контейнер/i.test(pack) ? null :
    Object.keys(jarTypes).find(key => jarTypes[key].test(pack)) ?? null;
  const stockText = field(details, 'наявність|наличие');
  const offers = [ld?.offers ?? []].flat();
  const offer = offers.length === 1 ? offers[0] : undefined;
  const currency = offer?.priceCurrency ?? meta('product:price:currency') ?? 'UAH';
  const visiblePrice = page.match(/(?:ціна|цена)\s*[-–—:]?\s*(\d[\d ]*(?:[.,]\d{1,2})?)\s*(?:грн|₴)/iu)?.[1];
  const canonical = nodes.find(n => n.tagName === 'link' && attr(n, 'rel') === 'canonical');
  const url = ikuraUrl(attr(canonical ?? {}, 'href'), finalUrl)?.href ?? finalUrl;
  return {
    name, weight, packaging, species: titleSpecies && detailSpecies && titleSpecies !== detailSpecies ? null : detailSpecies ?? titleSpecies,
    brandText: [typeof ld?.brand === 'object' ? ld.brand?.name : ld?.brand,
      field(details, 'торгова\\s+марка|торговая\\s+марка'), name].filter(Boolean),
    price: currency.toUpperCase() === 'UAH' ? amount(offer?.price ?? meta('product:price:amount') ?? meta('price') ?? visiblePrice) : null,
    availability: stock(stockText || offer?.availability || meta('product:availability')),
    variant: /спец\s*банка/iu.test(name) ? 'спецбанка' : null,
    frozen: /заморож|морожен|frozen/iu.test(name),
    images: photoUrls(nodes, meta, ld, name, finalUrl),
    url
  };
}

export function matches(item, card) {
  const loosePackaging = item.packaging === 'unknown' || /^ст\.(?:\s|$)/u.test(item.packagingLabel ?? '');
  if (!card.species || !card.weight || item.species !== card.species ||
      (!loosePackaging && item.packaging !== card.packaging) || item.weight !== card.weight ||
      (item.variant === 'спецбанка') !== (card.variant === 'спецбанка') ||
      item.temperature.startsWith('−') !== card.frozen) return false;
  return sameBrand(item, card);
}

export function sameBrand(item, card) {
  const brandNames = [item.brand, ...(brands[item.brand] ?? [])].map(normalize);
  const matchBrand = phrase => brandNames.some(brand => (' ' + normalize(phrase) + ' ').includes(' ' + brand + ' '));
  const signals = card.brandText;
  return signals.length > 1 ? signals.slice(0, -1).some(matchBrand) : signals.some(matchBrand);
}

function titleKey(name) {
  return normalize(name)
    .replace(/червона|красная/g, 'red').replace(/ікра|икра/g, 'roe')
    .replace(/форелі|форели/g, 'trout').replace(/горбуші|горбуши/g, 'pink')
    .replace(/кети|кеты/g, 'chum').replace(/чавичі|чавичи|чавычи/g, 'chinook')
    .replace(/щуки|щук[аиі]/g, 'pike').replace(/тріски|трески/g, 'cod')
    .replace(/червоне золото|красное золото/g, 'red gold')
    .replace(/золота унція|золотая унция/g, 'gold ounce').replace(/острів|остров/g, 'island')
    .replace(/(\d+)\s*(?:г|g)(?=\s|$)/gu, '$1 g');
}

function numericId(card) {
  const path = new URL(card.url).pathname;
  const suffix = path.match(/[-_](\d+)\/?$/)?.[1];
  return path.match(/\/(\d+)\/?$/)?.[1] ?? (Number(suffix) === card.weight ? null : suffix);
}

export function deduplicateCards(cards) {
  const buckets = [];
  for (const card of cards) {
    const id = numericId(card);
    const keys = new Set(['url:' + card.url]);
    if (id) keys.add('id:' + Number(id));
    if (card.weight && card.price != null) keys.add('title:' + [titleKey(card.name), card.weight, card.price].join('|'));
    const overlaps = buckets.filter(bucket => [...keys].some(key => bucket.keys.has(key)));
    const bucket = { keys, cards: [card] };
    for (const match of overlaps) {
      for (const key of match.keys) keys.add(key);
      bucket.cards.push(...match.cards);
      buckets.splice(buckets.indexOf(match), 1);
    }
    buckets.push(bucket);
  }
  return buckets.map(bucket => {
    const [preferred, ...others] = bucket.cards.sort((a, b) =>
      Number(new URL(b.url).pathname.startsWith('/ua/')) - Number(new URL(a.url).pathname.startsWith('/ua/')));
    return { ...preferred, images: [...new Set([preferred, ...others].flatMap(card => card.images))] };
  });
}
