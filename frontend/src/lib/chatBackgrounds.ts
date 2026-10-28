import type { BubbleStyleId } from "@/lib/bubbleStyles";

/**
 * Личные фоны чата. Новый фон = запись в CHAT_BACKGROUNDS (id + подпись в переводах `chatBackground.items.<id>`),
 * рисунок в public/chat-bg (scripts/generate-chat-backgrounds.mjs) или градиент в styles/chatBackgrounds.scss
 * и id в backend/src/config/chat-prefs.ts.
 *
 * Данные: профиль пользователя хранит `{ v: 1, def?: { id, dim }, rooms?: { [roomKey]: { id, dim } } }`.
 * "default" - «Стандартний» (без фона); нет записи у чата - действует фон по умолчанию.
 */
export const CHAT_BACKGROUNDS = [
  { id: "default", kind: "none" },
  { id: "pasture", kind: "art" },
  { id: "vineyard", kind: "art" },
  { id: "bethlehem", kind: "art" },
  { id: "rainbow", kind: "art" },
  { id: "olive", kind: "pattern" },
  { id: "waves", kind: "pattern" },
  { id: "grad-amber", kind: "gradient" },
  { id: "grad-stone", kind: "gradient" },
  { id: "grad-sea", kind: "gradient" },
] as const;

export type ChatBackgroundId = (typeof CHAT_BACKGROUNDS)[number]["id"];
export const DEFAULT_CHAT_BACKGROUND: ChatBackgroundId = "default";
export const CHAT_BG_DIM_MAX = 60;
export const CHAT_BG_DIM_DEFAULT = 0;

export interface ChatBackgroundChoice {
  id: ChatBackgroundId;
  /** Затемнение (тёмная тема) / осветление (светлая), 0..60 %. */
  dim: number;
}
export interface ChatBackgrounds {
  v: 1;
  def?: ChatBackgroundChoice;
  rooms?: Record<string, ChatBackgroundChoice>;
}

const IDS = CHAT_BACKGROUNDS.map((b) => b.id) as readonly string[];
/** Убранные фоны («Небо», «Савана», «Троянда»): сохранённое значение читаем как «Стандартний», а не ломаем профиль. */
const REMOVED_IDS: readonly string[] = ["sky", "savanna", "grad-rose"];
export const isChatBackgroundId = (v: unknown): v is ChatBackgroundId => typeof v === "string" && IDS.includes(v);

const isPlain = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

function choiceOf(v: unknown): ChatBackgroundChoice | null {
  if (isPlain(v) && typeof v.id === "string" && REMOVED_IDS.includes(v.id)) return { id: "default", dim: 0 };
  if (!isPlain(v) || !isChatBackgroundId(v.id)) return null;
  const raw = typeof v.dim === "number" && Number.isFinite(v.dim) ? v.dim : 0;
  return { id: v.id, dim: Math.max(0, Math.min(CHAT_BG_DIM_MAX, Math.round(raw))) };
}

/** Разбор значения из профиля (сервер уже чистит, но клиент не доверяет формату). */
export function normalizeChatBackgrounds(raw: unknown): ChatBackgrounds {
  const out: ChatBackgrounds = { v: 1 };
  if (!isPlain(raw)) return out;
  const def = choiceOf(raw.def);
  if (def) out.def = def;
  if (isPlain(raw.rooms)) {
    const rooms: Record<string, ChatBackgroundChoice> = {};
    for (const [key, value] of Object.entries(raw.rooms)) {
      const c = choiceOf(value);
      if (c) rooms[key] = c;
    }
    if (Object.keys(rooms).length) out.rooms = rooms;
  }
  return out;
}

export interface ResolvedBackground {
  id: ChatBackgroundId;
  dim: number;
  /** Откуда значение: свой фон чата, фон по умолчанию или ничего не выбрано. */
  source: "room" | "default" | "none";
}

/** Какой фон показывать в чате roomKey: свой фон чата, иначе фон по умолчанию, иначе «Стандартний». */
export function resolveChatBackground(prefs: ChatBackgrounds, roomKey: string | null | undefined): ResolvedBackground {
  const own = roomKey ? prefs.rooms?.[roomKey] : undefined;
  if (own) return { ...own, source: "room" };
  if (prefs.def) return { ...prefs.def, source: "default" };
  return { id: DEFAULT_CHAT_BACKGROUND, dim: CHAT_BG_DIM_DEFAULT, source: "none" };
}

/** Новое значение настроек с фоном по умолчанию (choice = null - сбросить). */
export function withDefaultBackground(prefs: ChatBackgrounds, choice: ChatBackgroundChoice | null): ChatBackgrounds {
  const next: ChatBackgrounds = { v: 1, ...(prefs.rooms ? { rooms: prefs.rooms } : {}) };
  if (choice) next.def = choice;
  return next;
}

/** Новое значение настроек с фоном конкретного чата (choice = null - «Як за замовчуванням»). */
export function withRoomBackground(prefs: ChatBackgrounds, roomKey: string, choice: ChatBackgroundChoice | null): ChatBackgrounds {
  const rooms = { ...(prefs.rooms ?? {}) };
  if (choice) rooms[roomKey] = choice;
  else delete rooms[roomKey];
  const next: ChatBackgrounds = { v: 1, ...(prefs.def ? { def: prefs.def } : {}) };
  if (Object.keys(rooms).length) next.rooms = rooms;
  return next;
}

/** Ключ чата для настроек: глобальный, «Поділись з Ісусом» и личные чаты (по id собеседника, он стабилен). */
export function chatRoomBackgroundKey(opts: { routeRoomId: string | undefined; directUserId?: string | null }): string | null {
  if (opts.directUserId) return `dm-${opts.directUserId}`.slice(0, 64);
  const raw = opts.routeRoomId;
  return raw && /^[A-Za-z0-9:_-]{1,64}$/.test(raw) ? raw : null;
}

/** Рекомендованный фон для стиля пузырей (только подсказка, сам фон не меняется). */
export const RECOMMENDED_BACKGROUND: Partial<Record<BubbleStyleId, ChatBackgroundId>> = {
  lamb: "pasture",
  vine: "vineyard",
  thorns: "bethlehem",
  ichthys: "waves",
};
