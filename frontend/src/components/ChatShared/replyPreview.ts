import type { useTranslations } from "next-intl";
import { bookPreviewLabel } from "@/lib/book/bookFile";
import { stripLegacyReplyPrefix } from "@/lib/legacyReplyPrefix";
import { mediaPreviewLabel } from "@/lib/mediaPreviewLabel";
import { parseStickerMessagePayload } from "@/lib/stickerMessage";
import { parseFlockInvite } from "@/lib/flockInviteMessage";
import { parseVerseSharePayload } from "@/lib/verseShareMessage";
import { scripturePlainText } from "@/lib/sanitizeScriptureHtml";

type PreviewInput = {
  content: string;
  type?: string;
  fileUrl?: string | null;
  voiceDuration?: number | null;
};

const PREVIEW_MAX_LENGTH = 140;

/** Короткий підпис оригіналу для цитати/плашки відповіді ("Стікер", "Фото", "Голосове" або перший рядок). */
export function replyPreviewText(
  t: ReturnType<typeof useTranslations>,
  m: PreviewInput,
): string {
  const media = mediaPreviewLabel((key) => t(key), m, true);
  if (media) return media;

  // Оригінал може бути старою відповіддю з префіксом [[reply:…]] — цитуємо лише текст.
  const text = stripLegacyReplyPrefix(m.content).trim();
  if (parseStickerMessagePayload(text)) return t("previewSticker");
  if (parseFlockInvite(text)) return t("previewFlockInvite");
  const verse = parseVerseSharePayload(text);
  const plain = verse.payload ? scripturePlainText(verse.payload.text) || text : text;
  const firstLine = plain.split(/\r?\n/).find((line) => line.trim()) ?? "";
  return firstLine.replace(/\s+/g, " ").trim().slice(0, PREVIEW_MAX_LENGTH);
}
