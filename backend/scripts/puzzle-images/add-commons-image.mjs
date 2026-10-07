#!/usr/bin/env node
/**
 * Додає картинки для гри «Пазли»: бере сторінки Wikimedia Commons, ПЕРЕВІРЯЄ ліцензію в метаданих
 * (приймаємо лише Public Domain / CC0), стискає до WebP (~1600 px по довшій стороні) у
 * frontend/public/puzzles/ і дописує запис у backend/src/chat/puzzle/data/images.json.
 * Картинки без чіткої ліцензії відхиляються й у набір не потрапляють.
 *
 * Використання:
 *   node backend/scripts/puzzle-images/add-commons-image.mjs --character abraham "File:012.Abraham and the Three Angels.jpg"
 *   node backend/scripts/puzzle-images/add-commons-image.mjs --list backend/scripts/puzzle-images/images.list.json
 *
 * Формат списку: [{ "character": "abraham", "file": "File:012.…jpg", "year": 1866, "title": "…" }]
 * (`year`, `title`, `author` — необов'язкові перевизначення: в метаданих скану дата часто — рік сканування, а не створення,
 * а в частини файлів не вказано автора; перевизначайте лише те, що перевірено за джерелом).
 * `character` — id персонажа (одну картину можна додати кільком персонажам окремими рядками) з «Вгадай персонажа» (backend/src/chat/guess-character/data).
 * Повторний запуск безпечний: уже додані файли пропускаються.
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const DATA_FILE = path.join(ROOT, 'backend/src/chat/puzzle/data/images.json');
const OUT_DIR = path.join(ROOT, 'frontend/public/puzzles');
const API = 'https://commons.wikimedia.org/w/api.php';
const UA = 'ChristApp-puzzle-importer/1.0 (https://github.com/Eddy-hub19/ChristApp)';
const MAX_SIDE = 1600;
const WEBP_QUALITY = 70;
/** Менше — розмиється на пазлі з 96 кусочків, тож такі файли не беремо. */
const MIN_LONG_SIDE = 1000;
const ALLOWED_LICENSE = /^(public domain|pd[- ]|pd$|cc0)/i;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function http(url, asJson) {
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    const res = await fetch(url, { headers: { 'User-Agent': UA } });
    if (res.ok) return asJson ? res.json() : Buffer.from(await res.arrayBuffer());
    if (res.status === 429 || res.status >= 500) {
      await sleep(2000 * attempt);
      continue;
    }
    throw new Error(`HTTP ${res.status} for ${url}`);
  }
  throw new Error(`Too many retries for ${url}`);
}

const stripHtml = (html) =>
  String(html ?? '')
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

async function imageInfo(title, thumbWidth) {
  const params = new URLSearchParams({
    action: 'query',
    format: 'json',
    prop: 'imageinfo',
    titles: title,
    iiprop: 'url|size|mime|extmetadata',
    redirects: '1',
  });
  if (thumbWidth) params.set('iiurlwidth', String(thumbWidth));
  const data = await http(`${API}?${params}`, true);
  const page = Object.values(data.query?.pages ?? {})[0];
  const info = page?.imageinfo?.[0];
  if (!page || page.missing !== undefined || !info) {
    throw new Error(`Файл не знайдено на Commons: ${title}`);
  }
  return { page, info };
}

/** Повертає запис для images.json або кидає помилку з причиною відмови. */
export async function fetchRecord(item) {
  const title = item.file.startsWith('File:') ? item.file : `File:${item.file}`;
  const { page, info } = await imageInfo(title);
  const meta = info.extmetadata ?? {};
  const license = stripHtml(meta.LicenseShortName?.value);
  if (!license || !ALLOWED_LICENSE.test(license)) {
    throw new Error(`Ліцензія не Public Domain/CC0 («${license || 'не вказана'}») — пропущено: ${title}`);
  }
  if (!/^(image\/(jpeg|png|webp|tiff))$/.test(info.mime)) {
    throw new Error(`Непідтримуваний тип ${info.mime}: ${title}`);
  }
  if (Math.max(info.width, info.height) < MIN_LONG_SIDE) {
    throw new Error(`Занадто мала роздільність ${info.width}×${info.height} (мінімум ${MIN_LONG_SIDE} px по довшій стороні): ${title}`);
  }
  const author = item.author ?? stripHtml(meta.Artist?.value);
  if (!author) throw new Error(`Не вказано автора: ${title}`);
  const rawYear =
    item.year ??
    Number(String(stripHtml(meta.DateTimeOriginal?.value ?? meta.DateTime?.value)).match(/\d{4}/)?.[0]);
  if (!rawYear) throw new Error(`Немає року створення (додайте "year" у списку): ${title}`);
  const niceTitle =
    item.title ??
    page.title
      .replace(/^File:/, '')
      .replace(/\.[a-z0-9]+$/i, '')
      .replace(/^\d+[A-Z]?\.\s*/, '')
      .replace(/^(Gustave\s+)?Dor[eé]\s*[-–,]\s*/i, '')
      .trim();
  return {
    title,
    niceTitle,
    author,
    year: rawYear,
    license,
    licenseUrl: stripHtml(meta.LicenseUrl?.value) || null,
    sourceUrl: info.descriptionurl,
    width: info.width,
    height: info.height,
    originalUrl: info.url,
    mime: info.mime,
  };
}

const slug = (s) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);

async function downloadWebp(record, outFile) {
  const long = Math.max(record.width, record.height);
  let source = record.originalUrl;
  if (long > MAX_SIDE) {
    // Просимо в Commons готову мініатюру, щоб не качати 20-мегапіксельний оригінал.
    const thumbWidth = Math.round((MAX_SIDE * record.width) / long);
    const { info } = await imageInfo(record.title, thumbWidth);
    source = info.thumburl ?? info.url;
  }
  const buffer = await http(source, false);
  const out = await sharp(buffer)
    .rotate()
    .resize({ width: MAX_SIDE, height: MAX_SIDE, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: WEBP_QUALITY, effort: 5, smartSubsample: true })
    .toBuffer({ resolveWithObject: true });
  await writeFile(outFile, out.data);
  return { width: out.info.width, height: out.info.height, bytes: out.data.length };
}

export async function addItems(items) {
  const dataset = JSON.parse(await readFile(DATA_FILE, 'utf8'));
  await mkdir(OUT_DIR, { recursive: true });
  const report = { added: [], skipped: [], rejected: [] };
  for (const item of items) {
    const title = item.file.startsWith('File:') ? item.file : `File:${item.file}`;
    const existing = dataset.images.find((i) => i.commonsTitle === title);
    if (existing?.characterIds.includes(item.character)) {
      report.skipped.push(title);
      continue;
    }
    if (existing) {
      // Та сама картина для іншого персонажа (Адам і Єва, Рут і Воаз…): файл не дублюємо.
      existing.characterIds.push(item.character);
      await writeFile(DATA_FILE, `${JSON.stringify(dataset, null, 2)}\n`);
      report.added.push(`${existing.id}  +${item.character} (та сама картина)`);
      continue;
    }
    try {
      const rec = await fetchRecord(item);
      const taken = dataset.images
        .filter((i) => i.id.startsWith(`${item.character}-`))
        .map((i) => Number(i.id.slice(item.character.length + 1)) || 0);
      const n = Math.max(0, ...taken) + 1;
      const id = `${item.character}-${n}`;
      const fileName = `${id}-${slug(rec.niceTitle)}.webp`;
      const out = await downloadWebp(rec, path.join(OUT_DIR, fileName));
      dataset.images.push({
        id,
        characterIds: [item.character],
        file: `/puzzles/${fileName}`,
        width: out.width,
        height: out.height,
        title: rec.niceTitle,
        author: rec.author,
        year: rec.year,
        license: rec.license,
        licenseUrl: rec.licenseUrl,
        commonsTitle: title,
        sourceUrl: rec.sourceUrl,
      });
      report.added.push(`${id}  ${rec.niceTitle}  (${rec.license}, ${Math.round(out.bytes / 1024)} KB)`);
      // Зберігаємо після кожної картинки: обрив на півдорозі не губить уже готове.
      await writeFile(DATA_FILE, `${JSON.stringify(dataset, null, 2)}\n`);
    } catch (error) {
      report.rejected.push(`${title}: ${error.message}`);
    }
    await sleep(700);
  }
  return report;
}

async function main() {
  const args = process.argv.slice(2);
  let items = [];
  const listAt = args.indexOf('--list');
  if (listAt !== -1) {
    items = JSON.parse(await readFile(path.resolve(args[listAt + 1]), 'utf8'));
  } else {
    const charAt = args.indexOf('--character');
    const character = charAt !== -1 ? args[charAt + 1] : null;
    const files = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--character');
    if (!character || files.length === 0) {
      console.error('Використання: --character <id> "File:…"  |  --list <list.json>');
      process.exit(2);
    }
    items = files.map((file) => ({ character, file }));
  }
  const report = await addItems(items);
  for (const line of report.added) console.log(`+ ${line}`);
  for (const line of report.skipped) console.log(`= вже є: ${line}`);
  for (const line of report.rejected) console.log(`! ${line}`);
  console.log(`\nДодано: ${report.added.length}, пропущено: ${report.skipped.length}, відхилено: ${report.rejected.length}`);
  if (report.rejected.length) process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
