import {
  mediaPreviewLabel,
  type PreviewTranslator,
} from "@/lib/mediaPreviewLabel";
import { parseStickerMessagePayload } from "@/lib/stickerMessage";
import { parseVerseSharePayload } from "@/lib/verseShareMessage";
import { stripLegacyReplyPrefix } from "@/lib/legacyReplyPrefix";
import { scripturePlainText } from "@/lib/sanitizeScriptureHtml";

export type ChatMessagePreviewInput = {
  content: string;
  type?: string;
  fileUrl?: string | null;
  voiceDuration?: number | null;
};

/**
 * Текст прев'ю для списку чатів і сповіщень. `t` — перекладач `chatShared`
 * (без нього підписи беруться українською).
 */
export function chatMessagePreview(
  m: ChatMessagePreviewInput,
  t?: PreviewTranslator,
): string {
  const media = mediaPreviewLabel(t, m);
  if (media) return media;
  // Старі відповіді несуть цитату префіксом [[reply:…]] — у превʼю йде лише сам текст.
  const text = stripLegacyReplyPrefix(m.content).trim();
  if (parseStickerMessagePayload(text)) {
    return t ? t("previewSticker") : "Стікер";
  }
  const verseShare = parseVerseSharePayload(text);
  if (verseShare.payload) {
    return scripturePlainText(verseShare.payload.text) || text;
  }
  return text;
}
