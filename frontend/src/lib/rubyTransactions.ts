/**
 * Подписи записей журнала рубинов (админка «Рубіни», при необходимости - профиль игрока): понятное название причины,
 * разбор заметки (note) по причине и единый формат даты. Данные в БД не меняются, разбор только на клиенте.
 * Новая причина в enum RubyReason без перевода показывается запасным читаемым названием (+ предупреждение в dev-консоли).
 */

/** Все значения enum RubyReason (backend/prisma/schema.prisma). */
export const RUBY_REASONS = [
  "ARENA_TOP1",
  "SKIN_PURCHASE",
  "ADMIN_ADJUST",
  "ENTRY_BONUS",
  "ARTIFACT_PURCHASE",
  "ARENA_BOSS",
  "ARENA_STREAK",
  "PREMIUM_COLLECTION",
  "TEAM_WIN",
] as const;
export type RubyReason = (typeof RUBY_REASONS)[number];

export interface RubyTxLike {
  reason: string;
  note: string | null;
  skinId: number | null;
  artifactId?: number | null;
  createdAt: string;
}

/** Переводчик раздела: ключ -> строка; `has` - есть ли такой ключ (next-intl: t.has). */
export interface RubyTxI18n {
  t: ((key: string, values?: Record<string, string | number>) => string) & { has: (key: string) => boolean };
  /** Название скина / артефакта (из flock.*). */
  skinName: (id: number) => string;
  artifactName: (id: number) => string;
}

const warned = new Set<string>();

/** «ARENA_TOP1» -> «Arena top1»: запасное название, пока перевода нет. */
export function fallbackReasonLabel(reason: string): string {
  const s = reason.toLowerCase().replace(/_/g, " ").trim();
  return s ? s[0].toUpperCase() + s.slice(1) : reason;
}

export function reasonLabel(reason: string, i18n: RubyTxI18n): string {
  const key = `reasons.${reason}`;
  if (i18n.t.has(key)) return i18n.t(key);
  if (process.env.NODE_ENV !== "production" && !warned.has(reason)) {
    warned.add(reason);
    console.warn(`[rubies] no translation for reason "${reason}": add admin.rubies.reasons.${reason} to messages/{ua,ru,en}.json`);
  }
  return fallbackReasonLabel(reason);
}

const pad = (n: number) => String(n).padStart(2, "0");

/** ДД.ММ.ГГГГ, ЧЧ:ММ (локальное время). */
export function formatRubyDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}, ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const STREAK_RE = /^streak day (\d+)\/(\d+),\s*(\d{4})-(\d{2})-(\d{2})$/;
/** uuid, длинный hex и подобные технические идентификаторы: пользователю не показываем. */
const TECH_ID_RE = /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[0-9a-f]{16,}|[A-Za-z0-9_-]{20,})$/i;

export interface RubyTxView {
  title: string;
  /** Мелкая заметка под названием (null - нечего показывать). */
  note: string | null;
  /** Технический id (например матча) - только во всплывающей подсказке. */
  hint: string | null;
  date: string;
}

/** Готовые подписи для строки журнала. */
export function describeRubyTx(tx: RubyTxLike, i18n: RubyTxI18n): RubyTxView {
  const { t } = i18n;
  let title = reasonLabel(tx.reason, i18n);
  let note: string | null = null;
  let hint: string | null = null;
  const raw = tx.note?.trim() || "";

  if (tx.reason === "SKIN_PURCHASE" && tx.skinId !== null) title += `: ${i18n.skinName(tx.skinId)}`;
  if (tx.reason === "ARTIFACT_PURCHASE" && tx.artifactId) title += `: ${i18n.artifactName(tx.artifactId)}`;

  if (tx.reason === "ADMIN_ADJUST") {
    // причина, которую ввёл админ, - как есть
    note = raw || null;
  } else if (raw === "admin grant") {
    note = t("notes.adminGrant");
  } else if (tx.reason === "ARENA_STREAK") {
    const m = STREAK_RE.exec(raw);
    if (m) note = t("notes.streakDay", { day: Number(m[1]), of: Number(m[2]), date: `${m[5]}.${m[4]}` });
    else note = raw || null;
  } else if (tx.reason === "TEAM_WIN") {
    // id матча не показываем, только в подсказке
    hint = raw || null;
  } else if (raw && !TECH_ID_RE.test(raw)) {
    // нераспознанный, но читаемый формат: как есть
    note = raw;
  } else if (raw) {
    hint = raw;
  }
  return { title, note, hint, date: formatRubyDate(tx.createdAt) };
}
