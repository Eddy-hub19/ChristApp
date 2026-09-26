import { Logger } from '@nestjs/common';
import { lookup as dnsLookup } from 'dns/promises';
import type { LookupAddress } from 'dns';
import { isIP, type LookupFunction } from 'net';
import { Agent, fetch as undiciFetch, type Headers as UndiciHeaders } from 'undici';

const logger = new Logger('UrlSafety');

const MAX_REDIRECTS = 3;
const DEFAULT_TIMEOUT_MS = 5_000;
/** З запасом для HTML <head> чи JSON-відповіді oEmbed — не для завантаження самого відео. */
const DEFAULT_MAX_BYTES = 2 * 1024 * 1024;
const USER_AGENT = 'ChristApp-WatchParty/1.0 (+link preview; contact: see repo)';

export class UnsafeUrlError extends Error {}

/** IPv4 у вигляді `a.b.c.d` — приватні/зарезервовані/link-local діапазони (RFC 1918, 3927, 5735). */
function isPrivateIPv4(a: number, b: number): boolean {
  if (a === 127) return true; // loopback 127.0.0.0/8
  if (a === 10) return true; // 10.0.0.0/8
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  if (a === 169 && b === 254) return true; // link-local 169.254.0.0/16
  if (a === 0) return true; // "this" network
  if (a >= 224) return true; // multicast (224-239) + reserved (240-255)
  return false;
}

/**
 * `::ffff:a.b.c.d` (IPv4-mapped IPv6) — URL/браузери можуть нормалізувати хвіст у hex-вигляд
 * (`::ffff:7f00:1` замість `::ffff:127.0.0.1`), тож розпізнаємо обидва варіанти написання.
 */
function ipv4MappedToDotted(lower: string): string | null {
  const dotted = /^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/.exec(lower);
  if (dotted) return dotted[1];
  const hex = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(lower);
  if (!hex) return null;
  const high = parseInt(hex[1], 16);
  const low = parseInt(hex[2], 16);
  return [
    (high >> 8) & 0xff,
    high & 0xff,
    (low >> 8) & 0xff,
    low & 0xff,
  ].join('.');
}

function isPrivateOrReservedIp(ip: string): boolean {
  const version = isIP(ip);
  if (version === 4) {
    const parts = ip.split('.').map(Number);
    if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return true;
    return isPrivateIPv4(parts[0], parts[1]);
  }
  if (version === 6) {
    const lower = ip.toLowerCase();
    if (lower === '::1') return true; // loopback
    if (lower.startsWith('fe80:') || lower.startsWith('fe8') || lower.startsWith('fe9'))
      return true; // link-local fe80::/10
    if (lower.startsWith('fc') || lower.startsWith('fd')) return true; // unique local fc00::/7
    const mapped = ipv4MappedToDotted(lower);
    if (mapped) return isPrivateOrReservedIp(mapped);
    return false;
  }
  // Не валідна IP — краще відмовити, ніж пропустити щось незрозуміле.
  return true;
}

/**
 * DNS-резолв хоста (або перевірка літеральної IP) з перевіркою кожної адреси. Повертає
 * список резолвнутих адрес, аби виклик, що встановлює з'єднання, міг "прип'яти" його саме до
 * НИХ (а не резолвити хост іще раз) — інакше лишається вікно для DNS rebinding: атакуючий сервер
 * повертає публічну адресу під час цієї перевірки, а вже на реальному TCP-конекті (секунди по
 * тому) — іншу відповідь на той самий хост, що резолвиться у приватну мережу. `null` означає, що
 * хост — уже літеральна публічна IP: резолвити нема чого, "пінити" з'єднання нема від чого захищати.
 */
async function resolveAndValidateHost(
  hostname: string,
  bareHost: string,
): Promise<LookupAddress[] | null> {
  if (isIP(bareHost)) {
    if (isPrivateOrReservedIp(bareHost)) {
      throw new UnsafeUrlError('Посилання на приватну адресу заборонене');
    }
    return null;
  }
  let addresses: LookupAddress[];
  try {
    addresses = await dnsLookup(hostname, { all: true });
  } catch {
    throw new UnsafeUrlError('Не вдалося визначити адресу хоста');
  }
  if (addresses.length === 0) {
    throw new UnsafeUrlError('Не вдалося визначити адресу хоста');
  }
  for (const { address } of addresses) {
    if (isPrivateOrReservedIp(address)) {
      throw new UnsafeUrlError('Посилання веде на приватну мережу');
    }
  }
  return addresses;
}

export type PinnedUrl = { url: URL; addresses: LookupAddress[] | null };

/**
 * Перевіряє протокол (лише http/https), забороняє localhost/приватні/link-local адреси —
 * ПІСЛЯ DNS-резолву, не лише за виглядом рядка. Кидає `UnsafeUrlError`, якщо посилання небезпечне
 * чи адресу хоста не вдалося визначити (тоді викликач має вважати перевірку невдалою, а не
 * "пощастило — вважаємо безпечним"). Повертає й резолвнуті адреси — див. `resolveAndValidateHost`
 * і `buildPinnedLookup` про те, навіщо (захист від DNS rebinding).
 */
export async function assertPublicHttpUrlPinned(rawUrl: string): Promise<PinnedUrl> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new UnsafeUrlError('Некоректне посилання');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new UnsafeUrlError('Підтримуються лише http/https посилання');
  }
  const hostname = url.hostname.toLowerCase();
  if (hostname === 'localhost' || hostname.endsWith('.localhost') || hostname === '0.0.0.0') {
    throw new UnsafeUrlError('Посилання на локальну адресу заборонене');
  }
  // URL.hostname для IPv6-літералів лишає квадратні дужки ("[::1]") — isIP() з ними не розпізнає
  // адресу і код провалився б у DNS-резолв (там для дужок він просто впаде, тож дірки нема, але
  // й розрахунку на конкретний код помилки — теж, тому знімаємо дужки явно).
  const bareHost =
    hostname.startsWith('[') && hostname.endsWith(']') ? hostname.slice(1, -1) : hostname;
  const addresses = await resolveAndValidateHost(hostname, bareHost);
  return { url, addresses };
}

/** Сумісний вигляд для простих викликів, яким не треба пінити з'єднання (лише сама перевірка). */
export async function assertPublicHttpUrl(rawUrl: string): Promise<URL> {
  return (await assertPublicHttpUrlPinned(rawUrl)).url;
}

/**
 * dns.lookup-сумісна функція, що завжди повертає ЗАЗДАЛЕГІДЬ перевірені адреси замість нового
 * резолву — саме це "пінить" реальне TCP/TLS-з'єднання до хосту, який ми перевірили, і закриває
 * вікно для DNS rebinding (сервер не встигає підмінити відповідь між перевіркою і конектом,
 * бо другого резолву просто не відбувається).
 */
export function buildPinnedLookup(addresses: LookupAddress[]): LookupFunction {
  return (_hostname, options, callback) => {
    if (options?.all) {
      callback(null, addresses);
    } else {
      const first = addresses[0];
      callback(null, first.address, first.family);
    }
  };
}

type UndiciResponse = Awaited<ReturnType<typeof undiciFetch>>;

async function readBodyCapped(res: UndiciResponse, maxBytes: number): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) return '';
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        throw new UnsafeUrlError('Відповідь завелика');
      }
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
  return Buffer.concat(chunks.map((c) => Buffer.from(c))).toString('utf-8');
}

export type SafeFetchResult = {
  status: number;
  headers: UndiciHeaders;
  /** Порожній рядок для HEAD або якщо тіло не читали. */
  bodyText: string;
  finalUrl: string;
};

/**
 * fetch(), безпечний для довільних URL від користувача: перевіряє (і резолвить) адресу перед
 * кожним з'єднанням — включно з кожним редиректом окремо (`redirect: 'manual'`, самі йдемо далі,
 * а не покладаємось на автоматичний слід fetch) — обмежує кількість переходів, час очікування
 * й розмір відповіді.
 */
export async function safeFetch(
  rawUrl: string,
  opts: { method?: 'GET' | 'HEAD'; timeoutMs?: number; maxBytes?: number } = {},
): Promise<SafeFetchResult> {
  const method = opts.method ?? 'GET';
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxBytes = opts.maxBytes ?? DEFAULT_MAX_BYTES;
  let currentUrl = rawUrl;

  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount++) {
    const { url: safeUrl, addresses } = await assertPublicHttpUrlPinned(currentUrl);
    // Свідомо undiciFetch (fetch САМЕ з npm-пакета 'undici'), а не глобальний Node fetch: глобальний
    // fetch — це ВБУДОВАНА в Node копія undici, яка може відрізнятись версією від встановленого
    // пакета, — а `dispatcher` з Agent одного undici, переданий у fetch іншого, ненадійний
    // (внутрішні перевірки типу можуть не збігтись). Fetch і Agent тут — з одного й того самого
    // модуля, тож сумісність гарантована. Пінимо з'єднання до вже перевірених адрес — без цього
    // fetch() резолвив би хост іще раз просто зараз, залишаючи вікно для DNS rebinding між
    // перевіркою й конектом.
    const dispatcher = addresses ? new Agent({ connect: { lookup: buildPinnedLookup(addresses) } }) : undefined;
    let res: UndiciResponse;
    try {
      res = await undiciFetch(safeUrl, {
        method,
        redirect: 'manual',
        signal: AbortSignal.timeout(timeoutMs),
        headers: { 'User-Agent': USER_AGENT },
        dispatcher,
      });
    } catch (err) {
      logger.debug(`fetch(${safeUrl}) failed: ${String(err)}`);
      throw new UnsafeUrlError('Не вдалося завантажити посилання');
    }

    if ([301, 302, 303, 307, 308].includes(res.status)) {
      const location = res.headers.get('location');
      if (!location) throw new UnsafeUrlError('Редирект без Location');
      if (redirectCount === MAX_REDIRECTS) {
        throw new UnsafeUrlError('Забагато редиректів');
      }
      currentUrl = new URL(location, safeUrl).toString();
      continue;
    }

    const bodyText = method === 'GET' ? await readBodyCapped(res, maxBytes) : '';
    return { status: res.status, headers: res.headers, bodyText, finalUrl: safeUrl.toString() };
  }
  throw new UnsafeUrlError('Забагато редиректів');
}

export type EmbedCheckResult = { embeddable: boolean; finalUrl: string };

/**
 * Чи дозволяє сторінка вбудовування в iframe (X-Frame-Options / CSP frame-ancestors).
 * `null` — перевірку не вдалося провести (мережа/таймаут/незрозуміла відповідь): викликач має
 * вважати джерело НЕ вбудовуваним (MANUAL), а не "пощастило — вважаємо, що можна".
 */
export async function checkEmbeddable(rawUrl: string): Promise<EmbedCheckResult | null> {
  try {
    let result = await safeFetch(rawUrl, { method: 'HEAD', timeoutMs: DEFAULT_TIMEOUT_MS });
    // Деякі сервери не підтримують HEAD (405/501) або не повертають потрібні заголовки — пробуємо
    // GET з невеликим лімітом (нам потрібні лише заголовки, тіло однаково відкидаємо).
    const hasFramingHeaders =
      result.headers.has('x-frame-options') || result.headers.has('content-security-policy');
    if (!hasFramingHeaders && (result.status >= 400 || result.status === 0)) {
      result = await safeFetch(rawUrl, { method: 'GET', timeoutMs: DEFAULT_TIMEOUT_MS, maxBytes: 65_536 });
    }
    if (result.status >= 400) return null;

    const xfo = (result.headers.get('x-frame-options') ?? '').toLowerCase();
    const csp = result.headers.get('content-security-policy') ?? '';
    const frameAncestorsMatch = /frame-ancestors\s+([^;]+)/i.exec(csp);
    const origin = new URL(result.finalUrl).origin;

    let blocked = xfo.includes('deny') || xfo.includes('sameorigin');
    if (frameAncestorsMatch) {
      const sources = frameAncestorsMatch[1].toLowerCase();
      const allowsAny = sources.includes('*') && !sources.includes("'none'");
      const allowsOrigin = sources.includes(origin.toLowerCase());
      blocked = sources.includes("'none'") || !(allowsAny || allowsOrigin);
    }
    return { embeddable: !blocked, finalUrl: result.finalUrl };
  } catch (err) {
    logger.debug(`checkEmbeddable(${rawUrl}) failed: ${String(err)}`);
    return null;
  }
}

/** JSON GET із тими самими SSRF-гарантіями (oEmbed-виклики Vimeo/Dailymotion). */
export async function safeFetchJson<T = unknown>(rawUrl: string): Promise<T | null> {
  try {
    const result = await safeFetch(rawUrl, { method: 'GET', maxBytes: 262_144 });
    if (result.status < 200 || result.status >= 300) return null;
    return JSON.parse(result.bodyText) as T;
  } catch (err) {
    logger.debug(`safeFetchJson(${rawUrl}) failed: ${String(err)}`);
    return null;
  }
}

/** Content-Type за HEAD-запитом (визначення типу файлу: video/mp4, application/x-mpegURL тощо). */
export async function safeFetchContentType(rawUrl: string): Promise<string | null> {
  try {
    const result = await safeFetch(rawUrl, { method: 'HEAD' });
    if (result.status >= 400) return null;
    return result.headers.get('content-type');
  } catch (err) {
    logger.debug(`safeFetchContentType(${rawUrl}) failed: ${String(err)}`);
    return null;
  }
}
