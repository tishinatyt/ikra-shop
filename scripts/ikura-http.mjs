import { setTimeout as sleep } from 'node:timers/promises';

export const base = 'https://www.ikura.com.ua';
export const userAgent = 'GoldenRoeCatalog/1.0 (retail product matching; Node.js)';
const hosts = new Set(['www.ikura.com.ua', 'ikura.com.ua']);
export function ikuraUrl(value, from = base) {
  try {
    const url = new URL(value, from);
    if (!value || url.protocol !== 'https:' || !hosts.has(url.hostname) || url.port || url.username || url.password) return null;
    url.hash = '';
    return url;
  } catch {
    return null;
  }
}

function parseRobots(text) {
  const groups = [];
  let group;
  for (const line of text.split(/\r?\n/)) {
    const [, key, value] = line.split('#')[0].match(/^\s*([\w-]+)\s*:\s*(.*?)\s*$/) ?? [];
    if (!key) continue;
    const field = key.toLowerCase();
    if (field === 'user-agent') {
      if (!group || group.hasRules) groups.push(group = { agents: [], rules: [], delay: 0 });
      group.agents.push(value.toLowerCase());
      continue;
    }
    if (!group) continue;
    if (field === 'crawl-delay' && value && Number.isFinite(Number(value))) group.delay = Math.max(group.delay, Number(value) * 1000);
    if (field !== 'allow' && field !== 'disallow') continue;
    group.hasRules = true;
    if (!value.startsWith('/')) continue;
    const anchored = value.endsWith('$');
    const path = anchored ? value.slice(0, -1) : value;
    const pattern = path.split('*').map(part => part.replace(/[.*+?^$\x7b\x7d()|[\]\\]/g, '\\$&')).join('.*');
    group.rules.push({ regex: new RegExp('^' + pattern + (anchored ? '$' : '')),
      allow: field === 'allow', size: Buffer.byteLength(path.replaceAll('*', '')) });
  }
  const exact = groups.filter(g => g.agents.includes('goldenroecatalog'));
  const chosen = exact.length ? exact : groups.filter(g => g.agents.includes('*'));
  return {
    delay: Math.max(2000, ...chosen.map(g => g.delay)),
    rules: chosen.flatMap(g => g.rules).sort((a, b) => b.size - a.size || Number(b.allow) - Number(a.allow))
  };
}

export function createClient({ transport = globalThis.fetch, wait = sleep } = {}) {
  const policies = new Map();
  let gap = 2000;
  let lastRequest;
  async function fetchOnce(url) {
    if (lastRequest !== undefined) await wait(Math.max(0, lastRequest + gap - Date.now()));
    const response = await transport(url, {
      redirect: 'manual', headers: { 'User-Agent': userAgent }, signal: AbortSignal.timeout(25_000)
    });
    try {
      return { status: response.status, location: response.headers.get('location'),
        type: response.headers.get('content-type') || '', bytes: Buffer.from(await response.arrayBuffer()) };
    } finally {
      lastRequest = Date.now();
    }
  }
  async function policy(origin) {
    if (policies.has(origin)) return policies.get(origin);
    let url = new URL('/robots.txt', origin);
    for (let i = 0; i < 6; i++) {
      const result = await fetchOnce(url);
      if ([301, 302, 303, 307, 308].includes(result.status)) {
        url = ikuraUrl(result.location, url);
        if (!url) break;
        continue;
      }
      if ([404, 410].includes(result.status)) {
        const missing = { rules: [], delay: 2000 };
        policies.set(origin, missing);
        return missing;
      }
      const body = result.bytes.toString('utf8');
      if (result.status !== 200 || /text\/html/i.test(result.type) || /^\s*</.test(body)) break;
      const parsed = parseRobots(body);
      gap = Math.max(gap, parsed.delay);
      policies.set(origin, parsed);
      return parsed;
    }
    throw new Error('Не вдалося перевірити robots.txt для ' + origin);
  }
  return async function request(href) {
    let url = ikuraUrl(href);
    for (let i = 0; i < 6 && url; i++) {
      const { rules } = await policy(url.origin);
      const decision = rules.find(rule => rule.regex.test(url.pathname + url.search));
      if (decision && !decision.allow) {
        const error = new Error('Заборонено robots.txt: ' + url.pathname + url.search);
        error.code = 'ROBOTS';
        throw error;
      }
      const response = await fetchOnce(url);
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        url = ikuraUrl(response.location, url);
        continue;
      }
      if (response.status !== 200) throw new Error('HTTP ' + response.status + ': ' + url.href);
      return { ...response, url };
    }
    throw new Error('Недозволена адреса або забагато перенаправлень: ' + href);
  };
}
