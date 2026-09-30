import type { useTranslations } from "next-intl";
import { parseVoiceMessageUrl } from "@/lib/voiceMessage";
import { parseStickerMessagePayload } from "@/lib/stickerMessage";
import { parseVerseSharePayload } from "@/lib/verseShareMessage";
import { scripturePlainText } from "@/lib/sanitizeScriptureHtml";

type PreviewInput = {
  content: string;
  type?: string;
  fileUrl?: string | null;
};

const PREVIEW_MAX_LENGTH = 140;

/** Короткий підпис оригіналу для цитати/плашки відповіді ("Стікер", "Фото", "Голосове" або перший рядок). */
export function replyPreviewText(
  t: ReturnType<typeof useTranslations>,
  m: PreviewInput,
): string {
  if (m.type === "VIDEO_NOTE") return t("previewVideoNote");
  if (m.type === "FILE") return t("previewFile");
  if (m.type === "VOICE") return t("previewVoice");
  if (m.type === "IMAGE" || Boolean(m.fileUrl?.trim())) return t("previewPhoto");

  const text = (m.content ?? "").trim();
  if (parseStickerMessagePayload(text)) return t("previewSticker");
  if (parseVoiceMessageUrl(text)) return t("previewVoice");
  const verse = parseVerseSharePayload(text);
  const plain = verse.payload ? scripturePlainText(verse.payload.text) || text : text;
  const firstLine = plain.split(/\r?\n/).find((line) => line.trim()) ?? "";
  return firstLine.replace(/\s+/g, " ").trim().slice(0, PREVIEW_MAX_LENGTH);
}
