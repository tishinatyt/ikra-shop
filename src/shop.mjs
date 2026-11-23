export const packaging = { glass: 'Скляна банка', plastic: 'Пластикова банка', metal: 'Жерстяна банка',
  bulk: 'Вагова', vacuum: 'Вакуумний пакет', unknown: 'Упаковку уточнюємо' };
export const species = { trout: 'Форель', pink: 'Горбуша', chum: 'Кета', chinook: 'Чавича', sockeye: 'Нерка', coho: 'Кижуч',
  salmon: 'Лососева, вид уточнюємо', pike: 'Щука', cod: 'Тріска', pollock: 'Минтай', sturgeon: 'Гібрид білуги',
  'salmon-tails': 'Смужки лосося', 'coho-slices': 'Скибочки кижуча', 'salmon-shavings': 'Стружка лосося' };
export const stocks = {
  in_stock: 'В наявності',
  preorder: 'Під замовлення — термін уточнимо під час підтвердження'
};
export const money = value => value == null ? 'Ціна за запитом' : new Intl.NumberFormat('uk-UA', {
  style: 'currency', currency: 'UAH', maximumFractionDigits: 2, minimumFractionDigits: 0
}).format(value);
export const escape = value => String(value ?? '').replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
})[character]);
export const productPath = product => 'produkt/' + product.slug + '/';

const recipes = [
  ['trout-pink', 'Святковий дует', ['trout', 'pink']],
  ['chum-chinook', 'Новорічний делікатес', ['chum', 'chinook']],
  ['trout-pink-chum', 'Три смаки', ['trout', 'pink', 'chum']]
];

const hits = [
  ['trout', 250], ['chinook', 250], ['chum', 250], ['pink', 200],
  ['sockeye', 200], ['coho', 200], ['trout', 500], ['chum', 190, 'Острів']
];

export function selectHits(products) {
  const selected = hits.map(([species, weight, brand = 'Червоне Золото']) => products.find(p =>
    p.visible !== false && p.species === species && p.weight === weight && p.brand === brand &&
    p.packaging === 'glass' && !p.variant)).filter(Boolean);
  const first = ['rkp-1-18', 'rkp-1-16', 'rkp-1-25', 'rkp-1-13', 'rkp-1-01'];
  const pinned = first.map(id => products.find(p => p.id === id)).filter(Boolean);
  const rest = selected.filter(p => !first.includes(p.id));
  return [...pinned, ...rest].sort((a, b) =>
    (first.indexOf(a.id) < 0 ? 5 : first.indexOf(a.id)) -
      (first.indexOf(b.id) < 0 ? 5 : first.indexOf(b.id)) ||
      Number(b.availability === 'in_stock') - Number(a.availability === 'in_stock'));
}

export function selectSets(products) {
  const hits = selectHits(products);
  return recipes.flatMap(([id, name, types]) => {
    const items = types.map(type => hits.find(product => product.species === type && product.availability === 'in_stock') ??
      products.find(product => product.visible !== false && product.species === type && product.availability === 'in_stock') ??
      hits.find(product => product.species === type) ?? products.find(product => product.visible !== false && product.species === type));
    if (items.some(item => !item)) return [];
    const price = items.some(item => item.price == null) ? null :
      Math.round(items.reduce((sum, item) => sum + item.price, 0) * 100) / 100;
    return [{ id, name, items, price }];
  });
}
