export const config = {
  name: 'Золоте зерно',
  siteUrl: 'https://ikra.fun',
  phone: '',
  telegram: '',
  localDeliveryTerms: 'Час і вартість доставки узгоджуємо під час підтвердження замовлення.',
  newYearPromotionUntil: '2027-01-10',
  newYearOrderDeadline: '',
  seoLastModified: '2026-11-21',
  paymentMethods: [{ id: 'upon-delivery', label: 'Оплата при отриманні (уточнюється)' }],
  async submitOrder(order) {
    console.info('Демонстраційне замовлення', { items: order.items, payment: order.payment });
    return { message: 'Дякуємо! Зв’яжемося для підтвердження' };
  }
};
