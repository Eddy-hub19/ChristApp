import { stripLegacyReplyPrefix } from 'src/common/legacy-reply-prefix';
import { bookPreviewLabel } from 'src/messages/book-sniff.util';
import {
  VOICE_META_PREFIX,
  VOICE_META_SUFFIX,
} from 'src/messages/voice-message';

/**
 * Тексти пушів. Сервер не знає мову інтерфейсу кожного пристрою, тому підписи медіа — фіксовані (укр.),
 * як і в прев'ю списку чатів.
 */
export const PUSH_LABELS = {
  voice: '🎤 Голосове',
  image: '🖼 Фото',
  file: '📎 Файл',
  video: '🎥 Відео',
  sticker: 'Стікер',
  flockInvite: '🐑 Запрошення в Отару',
} as const;

const STICKER_META_PREFIX = '[[sticker:';
const VERSE_SHARE_META_PREFIX = '[[verse-share:';
const FLOCK_INVITE_RE = /^\[\[flock-invite:\d{1,9}\]\]$/;
const META_SUFFIX = ']]';

export const PUSH_BODY_MAX_LEN = 220;

const collapse = (text: string) => text.replace(/\s+/g, ' ').trim();

function stripHtml(text: string) {
  return text
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

/**
 * Очищений текст повідомлення для пушу: без службових префіксів, HTML і зайвих пробілів;
 * для медіа й стікерів — короткий підпис. Порожній рядок — нічого показувати (пуш не шлемо).
 */
export function pushMessageText(
  type: string | null | undefined,
  content: string | null | undefined,
): string {
  const raw = String(content ?? '');
  const trimmed = raw.trim();

  if (
    type === 'VOICE' ||
    (trimmed.startsWith(VOICE_META_PREFIX) &&
      trimmed.endsWith(VOICE_META_SUFFIX))
  ) {
    return PUSH_LABELS.voice;
  }
  if (type === 'IMAGE') return PUSH_LABELS.image;
  if (type === 'FILE') return bookPreviewLabel(trimmed) ?? PUSH_LABELS.file;
  if (type === 'VIDEO_NOTE') return PUSH_LABELS.video;

  const withoutReply = stripLegacyReplyPrefix(raw).trim();
  if (withoutReply.startsWith(STICKER_META_PREFIX)) return PUSH_LABELS.sticker;
  if (FLOCK_INVITE_RE.test(withoutReply)) return PUSH_LABELS.flockInvite;
  if (withoutReply.startsWith(VERSE_SHARE_META_PREFIX)) {
    const end = withoutReply.indexOf(
      META_SUFFIX,
      VERSE_SHARE_META_PREFIX.length,
    );
    const after =
      end === -1 ? withoutReply : withoutReply.slice(end + META_SUFFIX.length);
    return collapse(stripHtml(after));
  }
  return collapse(withoutReply);
}

export function truncatePushText(text: string, maxLen = PUSH_BODY_MAX_LEN) {
  const t = collapse(text);
  return t.length <= maxLen ? t : `${t.slice(0, maxLen - 1)}…`;
}

export type PushDisplay = { title: string; body: string };

/**
 * Заголовок: імʼя співрозмовника (особистий чат) або назва чату (група, «Загальний чат»); для Киношки —
 * «🎬 <кімната>». Тіло для груп і Киношки — «<імʼя>: <повідомлення>», для особистого чату — саме повідомлення
 * (імʼя вже в заголовку). Відповідь на повідомлення адресата — «<імʼя> відповів(ла) вам: …».
 */
export function buildPushDisplay(input: {
  kind: 'dm' | 'group' | 'global' | 'watch';
  senderName: string;
  roomTitle?: string | null;
  text: string;
  isReplyToRecipient?: boolean;
}): PushDisplay {
  const sender = input.senderName.trim() || 'ChristApp';
  const text = truncatePushText(input.text);
  const prefix = input.isReplyToRecipient
    ? `${sender} відповів(ла) вам: `
    : null;

  if (input.kind === 'watch') {
    return {
      title: `🎬 ${(input.roomTitle ?? '').trim()}`.trim(),
      body: truncatePushText(`${prefix ?? `${sender}: `}${text}`),
    };
  }
  if (input.kind === 'dm') {
    return {
      title: sender,
      body: prefix ? truncatePushText(`${prefix}${text}`) : text,
    };
  }
  const title =
    input.kind === 'global'
      ? 'Загальний чат'
      : (input.roomTitle ?? '').trim() || 'ChristApp';
  return {
    title,
    body: truncatePushText(`${prefix ?? `${sender}: `}${text}`),
  };
}
