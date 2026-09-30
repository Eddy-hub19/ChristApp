import { parseVoiceMessageUrl } from "@/lib/voiceMessage";
import { parseStickerMessagePayload } from "@/lib/stickerMessage";
import { parseVerseSharePayload } from "@/lib/verseShareMessage";
import { stripLegacyReplyPrefix } from "@/lib/legacyReplyPrefix";
import { scripturePlainText } from "@/lib/sanitizeScriptureHtml";

export type ChatMessagePreviewInput = {
  content: string;
  type?: string;
  fileUrl?: string | null;
};

/** Текст прев'ю для списку чатів, сповіщень і відповідей. */
export function chatMessagePreview(m: ChatMessagePreviewInput): string {
  if (m.type === "VIDEO_NOTE") {
    return "Видео-овечка";
  }
  if (m.type === "FILE") {
    return "Файл";
  }
  const url = m.fileUrl?.trim();
  if (m.type === "IMAGE" || Boolean(url)) {
    return "Фото";
  }
  // Старі відповіді несуть цитату префіксом [[reply:…]] — у превʼю йде лише сам текст.
  const t = stripLegacyReplyPrefix(m.content).trim();
  if (parseStickerMessagePayload(t)) {
    return "Стикер";
  }
  if (parseVoiceMessageUrl(t)) {
    return "Голосовое сообщение";
  }
  const verseShare = parseVerseSharePayload(t);
  if (verseShare.payload) {
    return scripturePlainText(verseShare.payload.text) || t;
  }
  return t;
}
