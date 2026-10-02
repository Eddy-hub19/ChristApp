import { describe, expect, it } from "vitest";
import {
  classifyAttachment,
  fileIconKind,
  formatBytes,
  playableVoiceUrl,
  truncateMiddle,
  voiceFileName,
} from "./chatMedia";

const file = (name: string, type = "") => new File(["x"], name, { type });

describe("classifyAttachment", () => {
  it("detects images by mime and by extension (HEIC with empty mime)", () => {
    expect(classifyAttachment(file("a.jpg", "image/jpeg"))).toBe("image");
    expect(classifyAttachment(file("IMG_0001.HEIC", ""))).toBe("image");
  });
  it("detects documents and archives, rejects executables", () => {
    expect(classifyAttachment(file("a.zip", "application/zip"))).toBe("file");
    expect(classifyAttachment(file("a.docx"))).toBe("file");
    expect(classifyAttachment(file("a.pdf", "application/pdf"))).toBe("file");
    expect(classifyAttachment(file("evil.html", "text/html"))).toBeNull();
    expect(classifyAttachment(file("evil.svg", "image/svg+xml"))).toBeNull();
    expect(classifyAttachment(file("run.exe", "application/x-msdownload"))).toBeNull();
  });
});

describe("truncateMiddle", () => {
  it("keeps the extension visible", () => {
    const out = truncateMiddle("very-long-quarterly-financial-report-final-v2.docx", 30);
    expect(out.length).toBeLessThanOrEqual(30);
    expect(out.endsWith(".docx")).toBe(true);
    expect(out).toContain("…");
  });
  it("leaves short names alone", () => {
    expect(truncateMiddle("a.txt")).toBe("a.txt");
  });
});

describe("misc helpers", () => {
  it("formats bytes", () => {
    expect(formatBytes(0)).toBe("");
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(5 * 1024 * 1024)).toBe("5.0 MB");
  });
  it("picks an icon kind", () => {
    expect(fileIconKind("a.xlsx")).toBe("sheet");
    expect(fileIconKind("a.unknown")).toBe("generic");
  });
  it("names voice files by the real container", () => {
    expect(voiceFileName("audio/mp4;codecs=mp4a.40.2")).toBe("voice.m4a");
    expect(voiceFileName("audio/webm;codecs=opus")).toBe("voice.webm");
  });
  it("rewrites Cloudinary voice URLs to m4a and leaves others alone", () => {
    expect(
      playableVoiceUrl("https://res.cloudinary.com/x/video/upload/v1/christapp/chat-voice/abc.webm"),
    ).toBe("https://res.cloudinary.com/x/video/upload/v1/christapp/chat-voice/abc.m4a");
    expect(playableVoiceUrl("https://example.com/a.webm")).toBe("https://example.com/a.webm");
  });
});
