import { describe, expect, it } from "vitest";
import {
  bookFormatFromName,
  bookPreviewLabel,
  bookTitleFromFilename,
  formatBytes,
  toRawCloudinaryUrl,
} from "./bookFile";

describe("bookFile", () => {
  it("detects the format by extension", () => {
    expect(bookFormatFromName("War and Peace.EPUB")).toBe("epub");
    expect(bookFormatFromName("a.pdf")).toBe("pdf");
    expect(bookFormatFromName("a.mp3")).toBeNull();
  });

  it("builds a title and preview label", () => {
    expect(bookTitleFromFilename("Моя книга.epub")).toBe("Моя книга");
    expect(bookPreviewLabel("Моя книга.epub")).toBe("📖 Моя книга");
    expect(bookPreviewLabel("song.mp3")).toBeNull();
    expect(bookPreviewLabel(undefined)).toBeNull();
  });

  it("forces raw delivery for cloudinary urls only", () => {
    expect(toRawCloudinaryUrl("https://res.cloudinary.com/x/image/upload/v1/a.pdf")).toBe(
      "https://res.cloudinary.com/x/raw/upload/v1/a.pdf",
    );
    expect(toRawCloudinaryUrl("https://example.com/image/upload/a.pdf")).toBe(
      "https://example.com/image/upload/a.pdf",
    );
  });

  it("formats sizes", () => {
    expect(formatBytes(0)).toBe("");
    expect(formatBytes(512 * 1024)).toBe("512 KB");
    expect(formatBytes(3.5 * 1024 * 1024)).toBe("3.5 MB");
    expect(formatBytes(120 * 1024 * 1024)).toBe("120 MB");
  });
});
