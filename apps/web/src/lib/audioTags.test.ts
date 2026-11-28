import { describe, expect, it } from "vitest";
import { parseId3, parseMp4, parseOgg, tagsFromFileName } from "./audioTags";

const enc = (s: string) => new TextEncoder().encode(s);
const syncsafe = (n: number) => [(n >> 21) & 0x7f, (n >> 14) & 0x7f, (n >> 7) & 0x7f, n & 0x7f];
const be32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];

function id3Frame(id: string, text: Uint8Array, encoding: number) {
  const body = [encoding, ...text];
  return [...enc(id), ...be32(body.length), 0, 0, ...body];
}
function id3(frames: number[][]) {
  const all = frames.flat();
  return new Uint8Array([...enc("ID3"), 3, 0, 0, ...syncsafe(all.length), ...all]);
}

describe("audioTags", () => {
  it("читает ID3v2.3 в UTF-8 и windows-1251", () => {
    const cp1251 = new Uint8Array([0xcf, 0xf0, 0xe8, 0xe2, 0xe5, 0xf2]); // «Привет»
    const tags = parseId3(id3([id3Frame("TIT2", enc("Песня"), 3), id3Frame("TPE1", cp1251, 0)]));
    expect(tags).toEqual({ title: "Песня", artist: "Привет" });
  });

  it("читает UTF-16 с BOM", () => {
    const utf16 = new Uint8Array([0xff, 0xfe, 0x41, 0x00, 0x42, 0x00]);
    expect(parseId3(id3([id3Frame("TIT2", utf16, 1)])).title).toBe("AB");
  });

  it("не падает на мусоре", () => {
    expect(parseId3(new Uint8Array([1, 2, 3]))).toEqual({});
  });

  it("читает ilst из MP4", () => {
    const atom = (type: string, body: number[]) => [...be32(8 + body.length), ...Array.from(type, (c) => c.charCodeAt(0)), ...body];
    const item = (type: string, text: string) => atom(type, atom("data", [0, 0, 0, 1, 0, 0, 0, 0, ...enc(text)]));
    const ilst = atom("ilst", [...item("©nam", "Title"), ...item("©ART", "Artist")]);
    const meta = atom("meta", [0, 0, 0, 0, ...ilst]);
    const moov = atom("moov", atom("udta", meta));
    expect(parseMp4(new Uint8Array(moov))).toEqual({ title: "Title", artist: "Artist" });
  });

  it("читает комментарии Vorbis", () => {
    const le32 = (n: number) => [n & 255, (n >> 8) & 255, (n >> 16) & 255, (n >>> 24) & 255];
    const c1 = enc("TITLE=Song");
    const c2 = enc("ARTIST=Band");
    const bytes = new Uint8Array([3, ...enc("vorbis"), ...le32(1), 0x61, ...le32(2), ...le32(c1.length), ...c1, ...le32(c2.length), ...c2]);
    expect(parseOgg(bytes)).toEqual({ title: "Song", artist: "Band" });
  });

  it("имя файла: «Исполнитель - Название»", () => {
    expect(tagsFromFileName("Hillsong - Oceans_live.mp3")).toEqual({ artist: "Hillsong", title: "Oceans live" });
    expect(tagsFromFileName("just_a_song.mp3")).toEqual({ title: "just a song" });
  });
});
