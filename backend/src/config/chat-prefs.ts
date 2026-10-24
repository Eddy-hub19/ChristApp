/**
 * Личные настройки чата пользователя: фоны и шрифты. Видны только самому владельцу (отдаются лишь в приватных select'ах
 * jwt/auth/profile, в публичный справочник не попадают). Списки id - дзеркало frontend/src/lib/chatBackgrounds.ts
 * и frontend/src/lib/chatFonts.ts: новый фон/шрифт = id здесь + запись там.
 */

/** "default" - «Стандартний» (без фона). */
export const CHAT_BACKGROUND_IDS = [
  'default',
  'pasture',
  'sky',
  'savanna',
  'vineyard',
  'bethlehem',
  'rainbow',
  'olive',
  'waves',
  'grad-amber',
  'grad-stone',
  'grad-sea',
  'grad-rose',
] as const;

/** "as-is" - «Як зараз» (как сейчас в приложении), "system" - системный шрифт. */
export const CHAT_FONT_IDS = [
  'as-is',
  'system',
  'nunito',
  'rubik',
  'comfortaa',
  'caveat',
] as const;

export const CHAT_TEXT_SIZES = ['sm', 'md', 'lg'] as const;

/** Затемнение/освещение фона, %. */
export const CHAT_BG_DIM_MAX = 60;
export const CHAT_BG_MAX_ROOMS = 200;
export const CHAT_PREFS_MAX_BYTES = 8 * 1024;
const ROOM_KEY_RE = /^[A-Za-z0-9:_-]{1,64}$/;

export interface ChatBackgroundChoice {
  id: string;
  dim: number;
}
export interface ChatBackgrounds {
  v: 1;
  def?: ChatBackgroundChoice;
  rooms?: Record<string, ChatBackgroundChoice>;
}
export interface FontPrefs {
  v: 1;
  ui: string;
  msg: string;
  size: string;
}

const isPlain = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

function choiceOf(v: unknown): ChatBackgroundChoice | null {
  if (!isPlain(v) || typeof v.id !== 'string') return null;
  if (!(CHAT_BACKGROUND_IDS as readonly string[]).includes(v.id)) return null;
  const raw = typeof v.dim === 'number' && Number.isFinite(v.dim) ? v.dim : 0;
  return {
    id: v.id,
    dim: Math.max(0, Math.min(CHAT_BG_DIM_MAX, Math.round(raw))),
  };
}

/** Чистит JSON фонов: только известные id, dim 0..60, не больше CHAT_BG_MAX_ROOMS чатов. null - значения нет / сброс. */
export function sanitizeChatBackgrounds(raw: unknown): ChatBackgrounds | null {
  if (!isPlain(raw)) return null;
  const out: ChatBackgrounds = { v: 1 };
  const def = choiceOf(raw.def);
  if (def) out.def = def;
  if (isPlain(raw.rooms)) {
    const rooms: Record<string, ChatBackgroundChoice> = {};
    for (const [key, value] of Object.entries(raw.rooms)) {
      if (Object.keys(rooms).length >= CHAT_BG_MAX_ROOMS) break;
      if (!ROOM_KEY_RE.test(key)) continue;
      const c = choiceOf(value);
      if (c) rooms[key] = c;
    }
    if (Object.keys(rooms).length) out.rooms = rooms;
  }
  return out.def || out.rooms ? out : null;
}

/** Чистит настройки шрифтов; неизвестные значения заменяются на «Як зараз» / «Звичайний». null - всё по умолчанию. */
export function sanitizeFontPrefs(raw: unknown): FontPrefs | null {
  if (!isPlain(raw)) return null;
  const pick = (v: unknown, list: readonly string[], fallback: string) =>
    typeof v === 'string' && list.includes(v) ? v : fallback;
  const out: FontPrefs = {
    v: 1,
    ui: pick(raw.ui, CHAT_FONT_IDS, 'as-is'),
    msg: pick(raw.msg, CHAT_FONT_IDS, 'as-is'),
    size: pick(raw.size, CHAT_TEXT_SIZES, 'md'),
  };
  return out.ui === 'as-is' && out.msg === 'as-is' && out.size === 'md'
    ? null
    : out;
}

/** Размер JSON в байтах (для лимита CHAT_PREFS_MAX_BYTES). */
export const jsonBytes = (v: unknown) =>
  Buffer.byteLength(JSON.stringify(v ?? null), 'utf8');
