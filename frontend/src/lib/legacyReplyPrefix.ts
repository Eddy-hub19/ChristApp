/**
 * Старий формат відповіді: цитата жила префіксом у тексті повідомлення —
 * `[[reply:<encodeURIComponent(JSON)>]]<текст>`. Нові відповіді тримають `replyToId`, але старі
 * повідомлення в БД лишились як є, тож кожне місце, що показує/копіює/редагує текст (цитата,
 * плашка відповіді, превʼю списку чатів, сповіщення), має чистити префікс цією функцією.
 *
 * Дзеркало: backend/src/common/legacy-reply-prefix.ts — тримайте їх однаковими.
 */
export const LEGACY_REPLY_PREFIX = "[[reply:";
export const LEGACY_REPLY_SUFFIX = "]]";

export type LegacyReplyMeta = {
  id: string;
  username: string;
  content: string;
};

export type ParsedLegacyReply = {
  /** Текст без службового префікса (для "чистого" повідомлення — сам вхідний текст). */
  text: string;
  /** Розкодована цитата із зовнішнього префікса; null, якщо її нема/не розібралась. */
  meta: LegacyReplyMeta | null;
};

function decodeMeta(encoded: string): LegacyReplyMeta | null {
  try {
    const parsed = JSON.parse(decodeURIComponent(encoded)) as Partial<LegacyReplyMeta>;
    if (!parsed?.id || !parsed?.username) return null;
    return {
      id: String(parsed.id),
      username: String(parsed.username),
      content: String(parsed.content ?? ""),
    };
  } catch {
    return null;
  }
}

/**
 * Відділяє префікс (навіть вкладений: відповідь на відповідь) від тексту.
 * Префікс без закриття (напр. обрізаний до ліміту превʼю) не показуємо сирим — це порожній текст.
 */
export function parseLegacyReplyPrefix(raw: string | null | undefined): ParsedLegacyReply {
  let rest = String(raw ?? "");
  let meta: LegacyReplyMeta | null = null;
  let first = true;

  while (rest.trimStart().startsWith(LEGACY_REPLY_PREFIX)) {
    const body = rest.trimStart();
    const suffixIndex = body.indexOf(LEGACY_REPLY_SUFFIX, LEGACY_REPLY_PREFIX.length);
    if (suffixIndex === -1) {
      return { text: "", meta };
    }
    if (first) {
      meta = decodeMeta(body.slice(LEGACY_REPLY_PREFIX.length, suffixIndex));
      first = false;
    }
    rest = body.slice(suffixIndex + LEGACY_REPLY_SUFFIX.length);
  }

  return { text: rest, meta };
}

/** Текст повідомлення без старого префікса `[[reply:…]]`. */
export function stripLegacyReplyPrefix(raw: string | null | undefined): string {
  return parseLegacyReplyPrefix(raw).text;
}
