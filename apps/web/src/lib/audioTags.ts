/**
 * Название и исполнитель из тегов аудиофайла, без зависимостей: ID3v2 (mp3, aac), MP4 `ilst` (m4a), Vorbis/Opus-комментарии (ogg).
 * Читается в браузере при выборе файла; битый или пустой тег - просто `{}` (формы заполняются из имени файла).
 */
export interface AudioCover {
  data: Uint8Array;
  mime: "image/jpeg" | "image/png" | "image/webp";
}

export interface AudioTags {
  title?: string;
  artist?: string;
  /** Встроенная обложка (ID3 APIC, MP4 covr); в ogg не читается. */
  cover?: AudioCover;
}

export const MAX_COVER_BYTES = 5 * 1024 * 1024;

/** Тип картинки по первым байтам (расширение/mime в тегах бывают неверными); null - не jpeg/png/webp или больше лимита сервера. */
export function sniffImage(data: Uint8Array): AudioCover | null {
  if (data.length < 12 || data.length > MAX_COVER_BYTES) return null;
  if (data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return { data, mime: "image/jpeg" };
  if (data[0] === 0x89 && latin(data.subarray(1, 4)) === "PNG") return { data, mime: "image/png" };
  if (latin(data.subarray(0, 4)) === "RIFF" && latin(data.subarray(8, 12)) === "WEBP") return { data, mime: "image/webp" };
  return null;
}

/** Картинка ID3-кадра APIC (v2.3/2.4: кодировка, mime\0, тип, описание\0, данные) или PIC (v2.2: кодировка, 3 байта формата, тип, описание, данные). */
function parseApic(frame: Uint8Array, v22: boolean): { type: number; cover: AudioCover } | null {
  if (frame.length < 16) return null;
  const enc = frame[0];
  let pos = 1;
  if (v22) pos += 3;
  else {
    while (pos < frame.length && frame[pos] !== 0) pos++;
    pos++;
  }
  const type = frame[pos];
  pos++;
  // описание: для UTF-16 заканчивается двумя нулевыми байтами (по границе символа), иначе одним
  if (enc === 1 || enc === 2) {
    while (pos + 1 < frame.length && !(frame[pos] === 0 && frame[pos + 1] === 0)) pos += 2;
    pos += 2;
  } else {
    while (pos < frame.length && frame[pos] !== 0) pos++;
    pos++;
  }
  const cover = sniffImage(frame.subarray(pos));
  return cover ? { type, cover } : null;
}

const MAX_ID3_BYTES = 4 * 1024 * 1024;
const OGG_HEAD_BYTES = 128 * 1024;

const latin = (b: Uint8Array) => Array.from(b, (c) => String.fromCharCode(c)).join("");

/** Однобайтовый текст: валидный UTF-8 берём как есть, иначе windows-1251 (русские теги часто бывают в ней, а не в latin1). */
function decodeLegacy(bytes: Uint8Array): string {
  if (!bytes.some((c) => c >= 0x80)) return latin(bytes);
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    try {
      return new TextDecoder("windows-1251").decode(bytes);
    } catch {
      return latin(bytes);
    }
  }
}

function clean(text: string): string | undefined {
  // eslint-disable-next-line no-control-regex
  const value = text.replace(/\u0000+$/g, "").replace(/[\u0000-\u001f]/g, " ").trim();
  return value ? value.slice(0, 120) : undefined;
}

/** Текст ID3-кадра: первый байт - кодировка (0 latin1/1251, 1 UTF-16 с BOM, 2 UTF-16BE, 3 UTF-8). */
function decodeId3Text(data: Uint8Array): string | undefined {
  if (data.length < 2) return undefined;
  const enc = data[0];
  const body = data.subarray(1);
  try {
    if (enc === 1) {
      const le = body[0] === 0xff && body[1] === 0xfe;
      return clean(new TextDecoder(le ? "utf-16le" : "utf-16be").decode(body.subarray(body[0] === 0xff || body[0] === 0xfe ? 2 : 0)));
    }
    if (enc === 2) return clean(new TextDecoder("utf-16be").decode(body));
    if (enc === 3) return clean(new TextDecoder("utf-8").decode(body));
  } catch {
    return undefined;
  }
  return clean(decodeLegacy(body));
}

const syncsafe = (b: Uint8Array, at: number) => ((b[at] & 0x7f) << 21) | ((b[at + 1] & 0x7f) << 14) | ((b[at + 2] & 0x7f) << 7) | (b[at + 3] & 0x7f);
const be32 = (b: Uint8Array, at: number) => ((b[at] << 24) | (b[at + 1] << 16) | (b[at + 2] << 8) | b[at + 3]) >>> 0;

export function parseId3(buf: Uint8Array): AudioTags {
  if (buf.length < 10 || latin(buf.subarray(0, 3)) !== "ID3") return {};
  const version = buf[3];
  const end = Math.min(buf.length, 10 + syncsafe(buf, 6));
  const tags: AudioTags = {};
  let pos = 10;
  if (buf[5] & 0x40 && version >= 3) {
    // расширенный заголовок: пропускаем
    pos += version === 4 ? syncsafe(buf, pos) : be32(buf, pos) + 4;
  }
  const v22 = version === 2;
  const headLen = v22 ? 6 : 10;
  while (pos + headLen <= end) {
    const id = latin(buf.subarray(pos, pos + (v22 ? 3 : 4)));
    if (!id.trim() || id.charCodeAt(0) === 0) break;
    const size = v22 ? (buf[pos + 3] << 16) | (buf[pos + 4] << 8) | buf[pos + 5] : version === 4 ? syncsafe(buf, pos + 4) : be32(buf, pos + 4);
    const start = pos + headLen;
    if (size <= 0 || start + size > buf.length) break;
    if (id === "TIT2" || id === "TT2") tags.title ??= decodeId3Text(buf.subarray(start, start + size));
    else if (id === "TPE1" || id === "TP1") tags.artist ??= decodeId3Text(buf.subarray(start, start + size));
    else if (id === "APIC" || id === "PIC") {
      const pic = parseApic(buf.subarray(start, start + size), v22);
      // предпочитаем «лицевую» обложку (тип 3), иначе первую найденную
      if (pic && (!tags.cover || pic.type === 3)) tags.cover = pic.cover;
    }
    pos = start + size;
  }
  return tags;
}

/** MP4/M4A: moov > udta > meta > ilst > (©nam | ©ART) > data. */
export function parseMp4(buf: Uint8Array): AudioTags {
  const tags: AudioTags = {};
  const walk = (from: number, to: number, path: string[]) => {
    let pos = from;
    while (pos + 8 <= to) {
      let size = be32(buf, pos);
      const type = latin(buf.subarray(pos + 4, pos + 8));
      if (size === 1) size = Number.MAX_SAFE_INTEGER;
      if (size === 0) size = to - pos;
      if (size < 8) break;
      const stop = Math.min(to, pos + size);
      const body = pos + 8;
      const here = [...path, type];
      if (type === "moov" || type === "udta" || type === "ilst" || type === "©nam" || type === "©ART" || type === "aART" || type === "covr") walk(body, stop, here);
      else if (type === "meta") walk(body + 4, stop, here);
      else if (type === "data" && path.at(-1) === "covr") {
        tags.cover ??= sniffImage(buf.subarray(body + 8, stop)) ?? undefined;
      } else if (type === "data" && (path.at(-1) === "©nam" || path.at(-1) === "©ART")) {
        const text = clean(new TextDecoder("utf-8").decode(buf.subarray(body + 8, stop)));
        if (path.at(-1) === "©nam") tags.title ??= text;
        else tags.artist ??= text;
      }
      pos = stop;
    }
  };
  walk(0, buf.length, []);
  return tags;
}

/** Ogg: комментарии Vorbis (`\x03vorbis`) и Opus (`OpusTags`) - строки `КЛЮЧ=значение` в UTF-8. */
export function parseOgg(buf: Uint8Array): AudioTags {
  const text = latin(buf);
  let at = text.indexOf("OpusTags");
  let skip = 8;
  if (at < 0) {
    at = text.indexOf("\u0003vorbis");
    skip = 7;
  }
  if (at < 0) return {};
  let pos = at + skip;
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  if (pos + 4 > buf.length) return {};
  pos += 4 + view.getUint32(pos, true);
  if (pos + 4 > buf.length) return {};
  const count = view.getUint32(pos, true);
  pos += 4;
  const tags: AudioTags = {};
  for (let i = 0; i < count && pos + 4 <= buf.length; i++) {
    const len = view.getUint32(pos, true);
    pos += 4;
    if (len > 4096 || pos + len > buf.length) break;
    const line = new TextDecoder("utf-8").decode(buf.subarray(pos, pos + len));
    pos += len;
    const eq = line.indexOf("=");
    if (eq < 1) continue;
    const key = line.slice(0, eq).toUpperCase();
    if (key === "TITLE") tags.title ??= clean(line.slice(eq + 1));
    else if (key === "ARTIST") tags.artist ??= clean(line.slice(eq + 1));
  }
  return tags;
}

/** Теги выбранного файла; ничего не бросает. */
export async function readAudioTags(file: File): Promise<AudioTags> {
  try {
    const head = new Uint8Array(await file.slice(0, 10).arrayBuffer());
    if (latin(head.subarray(0, 3)) === "ID3") {
      const size = Math.min(MAX_ID3_BYTES, 10 + syncsafe(head, 6));
      return parseId3(new Uint8Array(await file.slice(0, size).arrayBuffer()));
    }
    if (latin(head.subarray(0, 4)) === "OggS") {
      return parseOgg(new Uint8Array(await file.slice(0, OGG_HEAD_BYTES).arrayBuffer()));
    }
    if (/\.(m4a|mp4|aac)$/i.test(file.name) || latin(head.subarray(4, 8)) === "ftyp") {
      // moov бывает и в конце файла: читаем целиком (загрузка и так ограничена 40 МБ)
      return parseMp4(new Uint8Array(await file.arrayBuffer()));
    }
  } catch {
    // нечитаемый файл: форма заполнится из имени
  }
  return {};
}

/** Запасной вариант без тегов: из имени файла («Исполнитель - Название.mp3»). */
export function tagsFromFileName(name: string): AudioTags {
  const base = name.replace(/\.[^.]+$/, "").replace(/_+/g, " ").trim();
  const split = base.split(/\s+[-–—]\s+/);
  if (split.length === 2 && split[0] && split[1]) return { artist: clean(split[0]), title: clean(split[1]) };
  return { title: clean(base) };
}
