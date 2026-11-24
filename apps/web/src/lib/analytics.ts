/**
 * Единый модуль аналитики (Google Tag Manager / dataLayer). Всё, что уходит наружу, проходит через `track()`.
 *
 * Правила приватности (см. docs/analytics.md):
 *  - в dataLayer попадают только анонимные категории действий и безопасные параметры из каталога ниже;
 *  - никаких ников, email, userId, id чатов/сообщений, текстов, названий комнат — их нельзя передать типами,
 *    а санитайзер дополнительно отбрасывает всё, похожее на email/uuid/длинный id и строки длиннее 50 символов;
 *  - без согласия (`analyticsConsent`) и без `NEXT_PUBLIC_GTM_ID` ничего не отправляется;
 *  - в админке, на выборе ника и (кроме page_view) на экранах входа события блокируются.
 */
import { readAnalyticsConsent, type AnalyticsConsent } from "@/lib/analyticsConsent";

/* ───────────────────────────── Каталог событий ───────────────────────────── */

type ChatKind = "dm" | "global";
type Currency = "ruby" | "emerald" | "coin";
type Testament = "old" | "new";

export type AnalyticsEvents = {
  /** Смена экрана. Путь — безопасный шаблон (/chat/[id]), без реальных значений. */
  page_view: { page_path: string; page_location: string };

  // Жизненный цикл
  app_open: { mode: "standalone" | "browser" };
  pwa_install_prompt_shown: { platform: "chromium" | "ios" };
  pwa_install_prompt_accepted: undefined;
  sign_up_completed: { method: "password" | "google" };
  login: { method: "password" | "google" };
  logout: undefined;
  google_connect: undefined;
  language_change: { lang: "en" | "ru" | "ua" };
  theme_change: { theme: "light" | "dark" };
  notifications_permission: { result: "granted" | "denied" };

  // Чаты
  chat_message_sent: {
    kind: "text" | "photo" | "voice" | "file" | "sticker" | "audio" | "video";
    chat: ChatKind;
  };
  reaction_added: undefined;
  message_pinned: undefined;
  mention_used: undefined;
  call_started: undefined;
  call_answered: undefined;
  call_missed: undefined;
  call_declined: undefined;
  call_ended: { duration_s: number };
  chat_background_change: { id: string };
  chat_font_change: { id: string };
  bubble_style_change: { id: string };

  // Библия
  bible_open: undefined;
  bible_translation_change: { translation: string };
  bible_search: { query_length: number; results: number };
  /** Только категория Завета: книга и глава намеренно не передаются. */
  bible_chapter_view: { testament: Testament };
  verse_saved: undefined;

  // Киношка
  cinema_room_created: undefined;
  cinema_room_joined: undefined;
  cinema_provider: { provider: "youtube" | "vimeo" | "file" | "other" };

  // Игры
  game_open: { game: string };
  game_start: { game: string };
  game_end: { game: string; result: "win" | "lose" | "end"; duration_s: number };
  puzzle_custom_image_uploaded: undefined;

  // «Отара»
  otara_lobby_open: undefined;
  otara_play_click: undefined;
  otara_match_start: { map: string; mode: string };
  otara_match_end: {
    map: string;
    duration_s: number;
    place: "top1" | "top3" | "top10" | "other";
    outcome: "died" | "left";
  };
  otara_skin_selected: { category: string };
  otara_skin_purchase_click: { category: string };
  otara_skin_purchased: { category: string; currency: Currency; price: number };
  otara_artifact_purchased: { currency: Currency; price: number };
  otara_quest_claimed: { difficulty: string; reward: number };
  otara_whats_new_open: undefined;
  otara_announcement_click: undefined;
  otara_mode_selected: { mode: string };
  otara_sound_toggle: { enabled: boolean };

  // Ошибки
  client_error: { category: string; code: string };
  socket_disconnect_long: { duration_s: number };
};

export type AnalyticsEventName = keyof AnalyticsEvents;

type ParamsArg<E extends AnalyticsEventName> = AnalyticsEvents[E] extends undefined
  ? []
  : [params: AnalyticsEvents[E]];

/** Допустимые ключи параметров на рантайме (тип гарантирует совпадение с каталогом). */
const PARAM_KEYS: {
  [E in AnalyticsEventName]: ReadonlyArray<
    AnalyticsEvents[E] extends undefined ? never : keyof AnalyticsEvents[E] & string
  >;
} = {
  page_view: ["page_path", "page_location"],
  app_open: ["mode"],
  pwa_install_prompt_shown: ["platform"],
  pwa_install_prompt_accepted: [],
  sign_up_completed: ["method"],
  login: ["method"],
  logout: [],
  google_connect: [],
  language_change: ["lang"],
  theme_change: ["theme"],
  notifications_permission: ["result"],
  chat_message_sent: ["kind", "chat"],
  reaction_added: [],
  message_pinned: [],
  mention_used: [],
  call_started: [],
  call_answered: [],
  call_missed: [],
  call_declined: [],
  call_ended: ["duration_s"],
  chat_background_change: ["id"],
  chat_font_change: ["id"],
  bubble_style_change: ["id"],
  bible_open: [],
  bible_translation_change: ["translation"],
  bible_search: ["query_length", "results"],
  bible_chapter_view: ["testament"],
  verse_saved: [],
  cinema_room_created: [],
  cinema_room_joined: [],
  cinema_provider: ["provider"],
  game_open: ["game"],
  game_start: ["game"],
  game_end: ["game", "result", "duration_s"],
  puzzle_custom_image_uploaded: [],
  otara_lobby_open: [],
  otara_play_click: [],
  otara_match_start: ["map", "mode"],
  otara_match_end: ["map", "duration_s", "place", "outcome"],
  otara_skin_selected: ["category"],
  otara_skin_purchase_click: ["category"],
  otara_skin_purchased: ["category", "currency", "price"],
  otara_artifact_purchased: ["currency", "price"],
  otara_quest_claimed: ["difficulty", "reward"],
  otara_whats_new_open: [],
  otara_announcement_click: [],
  otara_mode_selected: ["mode"],
  otara_sound_toggle: ["enabled"],
  client_error: ["category", "code"],
  socket_disconnect_long: ["duration_s"],
};

/* ───────────────────────────── Конфигурация ───────────────────────────── */

const GTM_ID_PATTERN = /^GTM-[A-Z0-9]{4,10}$/;

/** ID контейнера из окружения. `null` — аналитика полностью выключена (ничего не грузится и не отправляется). */
export const GTM_ID: string | null = (() => {
  const raw = process.env.NEXT_PUBLIC_GTM_ID?.trim();
  return raw && GTM_ID_PATTERN.test(raw) ? raw : null;
})();

const IS_DEV = process.env.NODE_ENV !== "production";

/* ───────────────────────────── Санитизация ───────────────────────────── */

const MAX_STRING_LENGTH = 50;
const EMAIL_LIKE = /\S+@\S+/;
const UUID_LIKE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
/** Длинный «id»: 20+ символов подряд без пробелов (cuid, base64, токены, hex-хеши). */
const LONG_ID_LIKE = /^[A-Za-z0-9_\-.]{20,}$/;
/** Длинные числа (телефоны, числовые id). */
const LONG_DIGITS = /\d{9,}/;

export function isSafeAnalyticsString(value: string): boolean {
  const v = value.trim();
  if (!v || v.length > MAX_STRING_LENGTH) return false;
  return !(
    EMAIL_LIKE.test(v) ||
    UUID_LIKE.test(v) ||
    LONG_ID_LIKE.test(v) ||
    LONG_DIGITS.test(v)
  );
}

/** Оставляет только разрешённые ключи и безопасные значения; всё остальное молча отбрасывается. */
export function sanitizeAnalyticsParams(
  event: AnalyticsEventName,
  params: unknown,
): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  if (!params || typeof params !== "object") return out;
  const allowed = PARAM_KEYS[event] as readonly string[];
  for (const key of allowed) {
    const value = (params as Record<string, unknown>)[key];
    if (typeof value === "boolean") {
      out[key] = value;
    } else if (typeof value === "number") {
      if (Number.isFinite(value)) out[key] = value;
    } else if (typeof value === "string") {
      if (isSafeAnalyticsString(value)) out[key] = value.trim();
    }
  }
  return out;
}

/* ───────────────────────────── Безопасный путь ───────────────────────────── */

const LOCALES = ["en", "ru", "ua"];

/** Убирает префикс локали: `/ru/chat/abc` → `/chat/abc`. */
export function stripLocale(pathname: string): string {
  const parts = pathname.split("?")[0].split("#")[0].split("/").filter(Boolean);
  if (parts.length && LOCALES.includes(parts[0])) parts.shift();
  return `/${parts.join("/")}`;
}

/**
 * Шаблон пути без динамических значений. Неизвестные маршруты сворачиваются до `/other`,
 * чтобы случайный сегмент (id, токен, ник) никогда не попал в аналитику.
 */
export function pageTemplate(pathname: string): string {
  const parts = stripLocale(pathname).split("/").filter(Boolean);
  const [a, b, c] = parts;
  if (!a) return "/login";
  switch (a) {
    case "register":
    case "choose-nickname":
      return `/${a}`;
    case "bible":
      if (!b) return "/bible";
      return c ? "/bible/[book]/[chapter]" : "/bible/[book]";
    case "chat":
      return b ? "/chat/[id]" : "/chat";
    case "movie":
      return b ? "/movie/[id]" : "/movie";
    case "cinema":
      if (!b) return "/cinema";
      return b === "join" ? "/cinema/join/[token]" : "/cinema/[roomId]";
    case "games":
      return b === "flock" ? "/games/flock" : b ? "/games/[game]" : "/games";
    case "admin":
      return "/admin";
    case "dashboard":
    case "profile":
    case "offline":
    case "welcome":
    case "privacy":
    case "terms":
      return `/${a}`;
    case "app":
      return "/app";
    default:
      return "/other";
  }
}

/** Экраны, где не отправляется вообще ничего. */
function isSilentTemplate(template: string): boolean {
  return template.startsWith("/admin") || template === "/choose-nickname";
}

/** Экраны входа: допустим только сам факт показа (page_view), без остальных событий. */
function isAuthTemplate(template: string): boolean {
  return template === "/login" || template === "/register";
}

function currentTemplate(): string {
  return pageTemplate(window.location.pathname);
}

/** Можно ли сейчас отправить событие с учётом экрана. */
function isAllowedOnRoute(event: AnalyticsEventName, template: string): boolean {
  if (isSilentTemplate(template)) return false;
  if (isAuthTemplate(template)) return event === "page_view";
  return true;
}

/** Нужно ли грузить GTM на этом экране (в админке — нет). */
export function shouldLoadGtmOnPath(pathname: string): boolean {
  return !pageTemplate(pathname).startsWith("/admin");
}

/* ───────────────────────────── dataLayer и согласие ───────────────────────────── */

type DataLayerWindow = Window & { dataLayer?: unknown[] };

function dataLayer(): unknown[] {
  const w = window as DataLayerWindow;
  w.dataLayer = w.dataLayer || [];
  return w.dataLayer;
}

/** Классический `gtag()`: в dataLayer должен попадать именно объект `arguments`, а не массив. */
function gtag(..._args: unknown[]): void {
  // eslint-disable-next-line prefer-rest-params
  dataLayer().push(arguments);
}

let initialized = false;

/**
 * Создаёт dataLayer и ставит default consent = denied для всего (реклама не используется, всегда denied).
 * Вызывается до загрузки скрипта GTM.
 */
export function initAnalyticsDataLayer(): void {
  if (typeof window === "undefined" || !GTM_ID || initialized) return;
  initialized = true;
  gtag("consent", "default", {
    analytics_storage: "denied",
    ad_storage: "denied",
    ad_user_data: "denied",
    ad_personalization: "denied",
  });
}

const BUFFER_LIMIT = 30;
let buffer: Array<{ event: AnalyticsEventName; params: Record<string, unknown> }> = [];

function pushEvent(event: AnalyticsEventName, params: Record<string, unknown>): void {
  dataLayer().push({ event, ...params });
}

function clearGaCookies(): void {
  try {
    const host = window.location.hostname;
    const domains = ["", host, `.${host}`, `.${host.split(".").slice(-2).join(".")}`];
    for (const part of document.cookie.split(";")) {
      const name = part.split("=")[0].trim();
      if (!/^(_ga|_gid|_gat)/.test(name)) continue;
      for (const domain of domains) {
        document.cookie = `${name}=; Max-Age=0; path=/${domain ? `; domain=${domain}` : ""}`;
      }
    }
  } catch {
    /* cookie недоступны — нечего чистить */
  }
}

/**
 * Применяет выбор пользователя: granted → обновляем только analytics_storage и сбрасываем буфер;
 * denied/нет выбора → буфер выбрасывается, GA-cookie удаляются.
 */
export function applyAnalyticsConsent(consent: AnalyticsConsent | null): void {
  if (typeof window === "undefined" || !GTM_ID) return;
  initAnalyticsDataLayer();
  if (consent === "granted") {
    gtag("consent", "update", { analytics_storage: "granted" });
    const pending = buffer;
    buffer = [];
    for (const item of pending) pushEvent(item.event, item.params);
    return;
  }
  buffer = [];
  if (consent === "denied") {
    gtag("consent", "update", { analytics_storage: "denied" });
    clearGaCookies();
  }
}

/* ───────────────────────────── Защита от частоты ───────────────────────────── */

const DEDUP_WINDOW_MS = 1000;
const RATE_WINDOW_MS = 60_000;
const RATE_LIMIT = 60;
const lastSent = new Map<string, number>();
let sentTimes: number[] = [];

function passesRateLimits(key: string, now: number): boolean {
  const last = lastSent.get(key);
  if (last !== undefined && now - last < DEDUP_WINDOW_MS) return false;
  sentTimes = sentTimes.filter((t) => now - t < RATE_WINDOW_MS);
  if (sentTimes.length >= RATE_LIMIT) return false;
  lastSent.set(key, now);
  sentTimes.push(now);
  if (lastSent.size > 200) {
    for (const [k, t] of lastSent) if (now - t > DEDUP_WINDOW_MS) lastSent.delete(k);
  }
  return true;
}

/** Только для тестов/отладки. */
export function __resetAnalyticsForTests(): void {
  lastSent.clear();
  sentTimes = [];
  buffer = [];
  initialized = false;
}

/* ───────────────────────────── track ───────────────────────────── */

function devLog(status: string, event: string, params?: Record<string, unknown>): void {
  if (!IS_DEV || typeof console === "undefined") return;
  // eslint-disable-next-line no-console
  console.debug(`[analytics] ${status} ${event}`, params ?? {});
}

/**
 * Единственная точка отправки событий. Никогда не бросает: при блокировщиках, без GTM и на сервере — тихий no-op.
 * Параметры типизированы каталогом `AnalyticsEvents`: лишние ключи не компилируются.
 */
export function track<E extends AnalyticsEventName>(event: E, ...rest: ParamsArg<E>): void {
  try {
    if (typeof window === "undefined") return;
    const params = sanitizeAnalyticsParams(event, rest[0]);

    if (!GTM_ID) {
      devLog("skip(no GTM_ID)", event, params);
      return;
    }
    const consent = readAnalyticsConsent();
    if (consent === "denied") {
      devLog("skip(denied)", event, params);
      return;
    }
    if (!isAllowedOnRoute(event, currentTemplate())) {
      devLog("skip(route)", event, params);
      return;
    }
    if (!passesRateLimits(`${event}:${JSON.stringify(params)}`, Date.now())) {
      devLog("skip(rate)", event, params);
      return;
    }
    if (consent === "granted") {
      initAnalyticsDataLayer();
      pushEvent(event, params);
      devLog("push", event, params);
      return;
    }
    // Выбора ещё нет: держим в памяти не дольше сессии; при отказе буфер выбрасывается.
    if (buffer.length < BUFFER_LIMIT) buffer.push({ event, params });
    devLog("buffer", event, params);
  } catch {
    /* аналитика не должна ломать приложение */
  }
}

/** `page_view` с безопасным шаблоном пути. Вызывается из одного места (AnalyticsRoot) при смене экрана. */
export function trackPageView(pathname: string): void {
  const template = pageTemplate(pathname);
  const pageLocation = `${window.location.origin}${template}`;
  setSafePageContext(template, pageLocation);
  track("page_view", {
    page_path: template,
    page_location: pageLocation,
  });
}

/**
 * `gtag("set")` обновляет значения для всех последующих хитов Google-тега, в том числе автоматических
 * (`user_engagement`), которые сам тег шлёт с реальным `document.location`. Без этого в GA4 уходил бы настоящий URL
 * (с id чата и языком). Сама команда ничего не отправляет, поэтому до согласия безопасна; при отказе не вызывается.
 */
function setSafePageContext(template: string, pageLocation: string): void {
  try {
    if (typeof window === "undefined" || !GTM_ID || readAnalyticsConsent() === "denied") return;
    initAnalyticsDataLayer();
    gtag("set", { page_location: pageLocation, page_path: template, page_title: "" });
  } catch {
    /* аналитика не должна ломать приложение */
  }
}

/* ───────────────────── Отложенные события входа ─────────────────────
 * Успешный вход/регистрация происходят на экране входа, где события запрещены. Поэтому момент фиксируется в
 * sessionStorage (только тип и способ, без данных) и отправляется на первом экране приложения. */

const PUBLIC_TEMPLATES = new Set(["/welcome", "/privacy", "/terms", "/offline", "/other"]);
const PENDING_AUTH_KEY = "christapp:analyticsPendingAuth";

export function markPendingAuthEvent(
  kind: "login" | "sign_up_completed",
  method: "password" | "google",
): void {
  try {
    window.sessionStorage.setItem(PENDING_AUTH_KEY, `${kind}:${method}`);
  } catch {
    /* sessionStorage недоступен — событие просто не отправится */
  }
}

export function flushPendingAuthEvent(): void {
  try {
    const raw = window.sessionStorage.getItem(PENDING_AUTH_KEY);
    if (!raw) return;
    // Только экраны самого приложения: вход Google могли отменить, и тогда пользователь остаётся на публичных страницах.
    const template = currentTemplate();
    if (!isAllowedOnRoute("login", template) || PUBLIC_TEMPLATES.has(template)) return;
    window.sessionStorage.removeItem(PENDING_AUTH_KEY);
    const [kind, method] = raw.split(":");
    if (method !== "password" && method !== "google") return;
    if (kind === "login") track("login", { method });
    else if (kind === "sign_up_completed") track("sign_up_completed", { method });
  } catch {
    /* см. выше */
  }
}
