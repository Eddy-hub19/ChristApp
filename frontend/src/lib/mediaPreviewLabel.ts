import { parseVoiceMessageUrl } from "@/lib/voiceMessage";

export type MediaPreviewInput = {
  content: string;
  type?: string;
  fileUrl?: string | null;
  voiceDuration?: number | null;
};

/** Перекладач `chatShared` (useTranslations або getTranslations). */
export type PreviewTranslator = (key: string) => string;

const FALLBACK: Record<string, string> = {
  previewPhoto: "🖼 Фото",
  previewVoice: "🎤 Голосове",
  previewVideoNote: "🎥 Відеокружок",
  previewFile: "📎 Файл",
};

function mmss(seconds: number): string {
  const safe = Math.max(0, Math.round(seconds));
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, "0")}`;
}

/**
 * Підпис медіа-повідомлення: "🎤 Голосове", "🖼 Фото", "📎 Файл", "🎥 Відеокружок".
 * `detailed` (для цитат) додає тривалість голосового й ім'я файлу; `null` — це не медіа.
 */
export function mediaPreviewLabel(
  t: PreviewTranslator | undefined,
  m: MediaPreviewInput,
  detailed = false,
): string | null {
  const label = (key: string) => (t ? t(key) : FALLBACK[key]);
  const text = m.content.trim();

  if (m.type === "VIDEO_NOTE") return label("previewVideoNote");
  if (m.type === "FILE") {
    return detailed && text ? `📎 ${text}` : label("previewFile");
  }
  if (m.type === "VOICE" || parseVoiceMessageUrl(text)) {
    return detailed && m.voiceDuration
      ? `${label("previewVoice")} ${mmss(m.voiceDuration)}`
      : label("previewVoice");
  }
  if (m.type === "IMAGE" || Boolean(m.fileUrl?.trim())) {
    // Підпис до фото показуємо лише в цитатах; у списку чатів і пушах — завжди "Фото".
    return detailed && text ? `🖼 ${text}` : label("previewPhoto");
  }
  return null;
}
