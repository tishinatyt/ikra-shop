export const config = {
  siteName: 'Золоте зерно. Червона ікра',
  shortName: 'Золоте зерно',
  siteUrl: 'https://ikra.fun',
  phone: '+380636002006',
  phoneDisplay: '+38 063 600 20 06',
  telegram: 'https://t.me/+380636002006',
  viber: 'viber://chat?number=%2B380636002006',
  orderFunctionUrl: 'https://pqasdmiqnlyyjwmmqeyc.supabase.co/functions/v1/ikra-order',
  pickupAddress: 'Чернігів, вул. Мстиславська, 67',
  pickupHours: 'Щодня 9:00–20:00',
  localDeliveryTerms: 'Самовивіз: Чернігів, вул. Мстиславська, 67, щодня 9:00–20:00, оплата при отриманні. Кур’єр по Чернігову та Нова Пошта по Україні — безкоштовно від 1000 г продукції; передоплата на картку, реквізити надішлемо після підтвердження.',
  address: { '@type': 'PostalAddress', streetAddress: 'вул. Мстиславська, 67', addressLocality: 'Чернігів', addressCountry: 'UA' },
  openingHours: 'Mo-Su 09:00-20:00',
  shippingThresholdGrams: 1000,
  newYearPromotionUntil: '2027-01-10',
  newYearOrderDeadline: '',
  seoLastModified: '2026-11-21',
  paymentMethods: [{ id: 'pickup', label: 'Самовивіз — оплата при отриманні' }, { id: 'delivery-card', label: 'Доставка — передоплата на картку після підтвердження' }],
  async submitOrder(order) {
    const failure = code => Object.assign(new Error('Замовлення не підтверджено'), { code });
    let response;
    try {
      response = await fetch(config.orderFunctionUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(order),
        signal: AbortSignal.timeout(20_000)
      });
    } catch {
      throw failure('UNAVAILABLE');
    }
    if (response.status >= 500) throw failure('UNAVAILABLE');
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      throw failure(response.status === 400 && data?.code === 'INVALID_CART' ? 'INVALID_CART' : 'REJECTED');
    }
    if (data?.ok !== true || !/^ZZ-\d{4}-\d{4}$/.test(data.orderNumber ?? '')) {
      throw failure('UNAVAILABLE');
    }
    return { message: 'Замовлення №' + data.orderNumber + ' прийнято. Дякуємо! Зв’яжемося для підтвердження.' };
  }
};
