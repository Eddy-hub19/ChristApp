import { describe, expect, it } from "vitest";
import { replyPreviewText } from "./replyPreview";

// Фейковий t: повертає людський підпис за ключем, як ua-переклад.
const labels: Record<string, string> = {
  previewSticker: "Стікер",
  previewPhoto: "🖼 Фото",
  previewVoice: "🎤 Голосове",
  previewVideoNote: "🎥 Відеокружок",
  previewFile: "📎 Файл",
};
const t = ((key: string) => labels[key] ?? key) as Parameters<typeof replyPreviewText>[0];

const legacy = (text: string) =>
  `[[reply:${encodeURIComponent(JSON.stringify({ id: "m1", username: "bob", content: "давнє" }))}]]${text}`;

describe("replyPreviewText", () => {
  it("returns the first line of plain text", () => {
    expect(replyPreviewText(t, { content: "Перший рядок\nДругий" })).toBe("Перший рядок");
  });

  it("quotes the clean text of a legacy reply (no [[reply:…]] garbage)", () => {
    expect(replyPreviewText(t, { content: legacy("Старий текст") })).toBe("Старий текст");
  });

  it("returns an empty string for empty text", () => {
    expect(replyPreviewText(t, { content: "" })).toBe("");
  });

  it("labels a sticker, even one sent as a legacy reply", () => {
    expect(replyPreviewText(t, { content: "[[sticker:cat]]/stickers/cat.png" })).toBe("Стікер");
    expect(replyPreviewText(t, { content: legacy("[[sticker:cat]]/stickers/cat.png") })).toBe("Стікер");
  });

  it("labels photos, files, voice and video notes", () => {
    expect(replyPreviewText(t, { content: "", type: "IMAGE", fileUrl: "https://x/y.jpg" })).toBe("🖼 Фото");
    expect(replyPreviewText(t, { content: "", type: "FILE" })).toBe("📎 Файл");
    expect(replyPreviewText(t, { content: "", type: "VOICE" })).toBe("🎤 Голосове");
    expect(replyPreviewText(t, { content: "", type: "VIDEO_NOTE" })).toBe("🎥 Відеокружок");
  });

  it("shows voice duration, file name and caption in quotes", () => {
    expect(replyPreviewText(t, { content: "", type: "VOICE", voiceDuration: 12 })).toBe("🎤 Голосове 0:12");
    expect(replyPreviewText(t, { content: "report.docx", type: "FILE" })).toBe("📎 report.docx");
    expect(replyPreviewText(t, { content: "захід сонця", type: "IMAGE" })).toBe("🖼 захід сонця");
  });
});
