import type { BookFormat } from "./bookFile";
import { readBookMeta, writeBookMeta, type BookMeta } from "./bookStore";
import { loadPdfJs } from "./pdfjs";
import { fetchBookFile } from "./shareFile";

const COVER_WIDTH = 240;
const inFlight = new Map<string, Promise<BookMeta>>();

async function downscale(source: Blob): Promise<Blob | null> {
  try {
    const bitmap = await createImageBitmap(source);
    const scale = Math.min(1, COVER_WIDTH / bitmap.width);
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    return await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.82));
  } catch {
    return null;
  }
}

async function pdfMeta(url: string): Promise<BookMeta> {
  const pdfjs = await loadPdfJs();
  const task = pdfjs.getDocument({ url, rangeChunkSize: 65536, disableAutoFetch: true });
  const doc = await task.promise;
  try {
    const meta: BookMeta = {};
    const info = (await doc.getMetadata().catch(() => null))?.info as
      | { Title?: string; Author?: string }
      | undefined;
    meta.title = info?.Title?.trim() || undefined;
    meta.author = info?.Author?.trim() || undefined;
    meta.size = (await doc.getDownloadInfo().catch(() => null))?.length;
    // Обкладинка — перша сторінка; малюється один раз і кешується в IndexedDB.
    const page = await doc.getPage(1);
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: (COVER_WIDTH * 2) / base.width });
    const canvas = document.createElement("canvas");
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    await page.render({ canvas, viewport }).promise;
    meta.cover = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.8),
    );
    canvas.width = 0;
    return meta;
  } finally {
    void task.destroy();
  }
}

function parseXml(text: string): Document {
  return new DOMParser().parseFromString(text, "application/xml");
}

function dirname(path: string): string {
  const i = path.lastIndexOf("/");
  return i < 0 ? "" : path.slice(0, i + 1);
}

function resolvePath(base: string, href: string): string {
  const parts = (base + decodeURIComponent(href.split("#")[0])).split("/");
  const out: string[] = [];
  for (const part of parts) {
    if (part === "..") out.pop();
    else if (part && part !== ".") out.push(part);
  }
  return out.join("/");
}

async function epubMeta(url: string, filename: string): Promise<BookMeta> {
  const file = await fetchBookFile(url, filename, "epub");
  const { default: JSZip } = await import("jszip");
  const zip = await JSZip.loadAsync(file);
  const meta: BookMeta = { size: file.size };

  const container = await zip.file("META-INF/container.xml")?.async("string");
  const opfPath = container
    ? parseXml(container).querySelector("rootfile")?.getAttribute("full-path")
    : null;
  const opfText = opfPath ? await zip.file(opfPath)?.async("string") : null;
  if (!opfPath || !opfText) return meta;

  const opf = parseXml(opfText);
  const byLocal = (name: string) =>
    Array.from(opf.getElementsByTagName("*")).filter((el) => el.localName === name);
  meta.title = byLocal("title")[0]?.textContent?.trim() || undefined;
  meta.author = byLocal("creator")[0]?.textContent?.trim() || undefined;

  const items = byLocal("item");
  const coverId = byLocal("meta")
    .find((el) => el.getAttribute("name") === "cover")
    ?.getAttribute("content");
  const coverItem =
    items.find((el) => (el.getAttribute("properties") ?? "").split(/\s+/).includes("cover-image")) ??
    items.find((el) => el.getAttribute("id") === coverId) ??
    items.find((el) => /cover/i.test(el.getAttribute("id") ?? "") && /^image\//.test(el.getAttribute("media-type") ?? ""));
  const coverHref = coverItem?.getAttribute("href");
  if (coverHref && /^image\//.test(coverItem?.getAttribute("media-type") ?? "")) {
    const entry = zip.file(resolvePath(dirname(opfPath), coverHref));
    if (entry) {
      const raw = await entry.async("blob");
      meta.cover = (await downscale(raw)) ?? raw;
    }
  }
  return meta;
}

/**
 * Назва, автор, розмір і обкладинка книги. Береться з метаданих файлу, кешується в IndexedDB —
 * тож повторний показ у стрічці не перемальовує і не перезавантажує нічого.
 */
export function loadBookMeta(url: string, format: BookFormat, filename: string): Promise<BookMeta> {
  const pending = inFlight.get(url);
  if (pending) return pending;
  const promise = (async () => {
    const cached = await readBookMeta(url);
    if (cached) return cached;
    let meta: BookMeta = {};
    try {
      meta = format === "pdf" ? await pdfMeta(url) : await epubMeta(url, filename);
    } catch {
      meta = {};
    }
    // Порожній результат (мережа/CORS) не кешуємо назавжди — спробуємо ще раз наступного разу.
    if (meta.title || meta.author || meta.cover || meta.size) {
      await writeBookMeta(url, meta);
    }
    return meta;
  })().finally(() => inFlight.delete(url));
  inFlight.set(url, promise);
  return promise;
}
