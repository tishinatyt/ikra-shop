# Золоте зерно. Червона ікра

Статична вітрина українською на HTML, CSS і JavaScript. Збірка в GitHub Actions використовує Node.js 20. Локально підтримуються Node.js 20.19+ у гілці 20 та Node.js 22.12 або новіший.

```powershell
npm.cmd run build
npm.cmd run preview
```

Попередній перегляд доступний за адресою http://127.0.0.1:4173. Результат збірки в `dist/`.

## Асортимент та IKURA

Збірка використовує готовий публічний каталог `data/products.json`. `npm.cmd run test:ikura` перевіряє імпортер на локальних тестових даних.

Команди `npm.cmd run fetch-ikura` та `npm.cmd run sync` потребують локального робочого комплекту `private/`. Звіт імпорту зберігається локально в `private/docs/matching.md`.

## Налаштування та публікація

Публічну адресу `https://ikra.fun`, контакти та URL функції замовлень задано в `config.mjs`. Замовлення обробляє Edge Function `ikra-order`. Для роботи вона потребує серверних секретів `TELEGRAM_BOT_TOKEN` та `IKRA_TG_CHAT_ID`. Підтвердження й номер замовлення з’являються після успішної відповіді Telegram.

У налаштуваннях GitHub Pages виберіть GitHub Actions як джерело та вкажіть `ikra.fun` як власний домен. Workflow збирає та публікує `dist/` із `CNAME`. CI використовує роздрібні ціни з `data/products.json` і не потребує `private/`.
