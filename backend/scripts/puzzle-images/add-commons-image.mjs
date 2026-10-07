#!/usr/bin/env node
/**
 * Додає картини для гри «Пазли»: бере сторінки Wikimedia Commons, ПЕРЕВІРЯЄ в метаданих
 *   • ліцензію — лише Public Domain / PD-Art / PD-old / CC0 (CC BY, CC BY-SA та без чіткої ліцензії відхиляються);
 *   • розмір — не менше 1000 px по довшій стороні;
 *   • кольоровість — чорно-білі, сепія й майже монохромні зображення (гравюри, рисунки) відхиляються,
 * стискає до WebP (~1600 px по довшій стороні), завантажує в Cloudinary (папка `christapp/puzzles`)
 * і дописує в backend/src/chat/puzzle/data/images.json лише дані з посиланнями — самих картинок у git немає.
 *
 * Використання:
 *   node backend/scripts/puzzle-images/add-commons-image.mjs --list backend/scripts/puzzle-images/images.list.json
 *   node backend/scripts/puzzle-images/add-commons-image.mjs --character abraham "File:….jpg"
 *   Прапорець --dry-run: усі перевірки без завантаження в Cloudinary й без запису даних.
 *   Прапорець --env-file <шлях>: звідки читати ключі Cloudinary (за замовчуванням backend/.env).
 *
 * Формат списку: [{ "character": "abraham", "file": "File:….jpg", "title": "…", "year": 1896,
 *                   "dateLabel": "1896–1902", "author": "James Tissot", "source": "Brooklyn Museum" }]
 *   `title`, `year`, `dateLabel`, `author`, `source` — необов'язкові перевизначення. Дата в метаданих скану
 *   часто — рік сканування, а не створення; перевизначайте лише те, що перевірено за джерелом.
 *   `character` — id персонажа з «Вгадай персонажа»; одну картину можна додати кільком персонажам
 *   окремими рядками (файл завантажується один раз).
 *
 * Ключі Cloudinary беруться зі змінних середовища CLOUDINARY_CLOUD_NAME / CLOUDINARY_API_KEY /
 * CLOUDINARY_API_SECRET або з backend/.env. Потрібні пакети `sharp` і `cloudinary` (вже є в монорепо).
 * Повторний запуск безпечний: уже додані файли пропускаються.
 */
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { v2 as cloudinary } from 'cloudinary';
import validation from './validation.cjs';

const { MIN_LONG_SIDE, colorMetrics, isColorful, isAllowedLicense } = validation;

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const DATA_FILE = path.join(ROOT, 'backend/src/chat/puzzle/data/images.json');
let ENV_FILE = path.join(ROOT, 'backend/.env');
const API = 'https://commons.wikimedia.org/w/api.php';
const UA = 'ChristApp-puzzle-importer/1.0 (https://github.com/Eddy-hub19/ChristApp)';
const CLOUDINARY_FOLDER = 'christapp/puzzles';

const MAX_SIDE = 1600;
const WEBP_QUALITY = 82;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function http(url, asJson) {
  for (let attempt = 1; attempt <= 6; attempt += 1) {
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

async function measureColor(buffer) {
  const raw = await sharp(buffer)
    .rotate()
    .resize(64, 64, { fit: 'fill' })
    .removeAlpha()
    .toColourspace('srgb')
    .raw()
    .toBuffer();
  return colorMetrics(raw);
}

/** Усі перевірки без завантаження; повертає запис і готовий буфер WebP, або кидає помилку з причиною відмови. */
export async function prepareRecord(item) {
  const title = item.file.startsWith('File:') ? item.file : `File:${item.file}`;
  const { page, info } = await imageInfo(title);
  const meta = info.extmetadata ?? {};
  const license = stripHtml(meta.LicenseShortName?.value);
  if (!isAllowedLicense(license)) {
    throw new Error(`Ліцензія не Public Domain/CC0 («${license || 'не вказана'}») — пропущено: ${title}`);
  }
  if (!/^(image\/(jpeg|png|webp|tiff))$/.test(info.mime)) {
    throw new Error(`Непідтримуваний тип ${info.mime}: ${title}`);
  }
  if (Math.max(info.width, info.height) < MIN_LONG_SIDE) {
    throw new Error(
      `Занадто мала роздільність ${info.width}×${info.height} (мінімум ${MIN_LONG_SIDE} px по довшій стороні): ${title}`,
    );
  }
  const author = item.author ?? stripHtml(meta.Artist?.value);
  if (!author) throw new Error(`Не вказано автора: ${title}`);
  const year =
    item.year ??
    Number(String(stripHtml(meta.DateTimeOriginal?.value ?? meta.DateTime?.value)).match(/\d{4}/)?.[0]);
  if (!year) throw new Error(`Немає року створення (додайте "year" у списку): ${title}`);

  // Мініатюра для перевірки кольору й для самої картинки: не качаємо 20-мегапіксельний оригінал.
  const long = Math.max(info.width, info.height);
  let source = info.url;
  if (long > MAX_SIDE) {
    const thumbWidth = Math.round((MAX_SIDE * info.width) / long);
    const thumb = await imageInfo(title, thumbWidth);
    source = thumb.info.thumburl ?? info.url;
  }
  const original = await http(source, false);
  const metrics = await measureColor(original);
  if (!isColorful(metrics)) {
    throw new Error(
      `Не кольорова картина (frac=${metrics.fraction.toFixed(3)}, sat=${metrics.meanSaturation.toFixed(3)}) — пропущено: ${title}`,
    );
  }
  const out = await sharp(original)
    .rotate()
    .resize({ width: MAX_SIDE, height: MAX_SIDE, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: WEBP_QUALITY, effort: 5 })
    .toBuffer({ resolveWithObject: true });

  const niceTitle =
    item.title ??
    page.title
      .replace(/^File:/, '')
      .replace(/\.[a-z0-9]+$/i, '')
      .trim();
  return {
    record: {
      title: niceTitle,
      author,
      year,
      ...(item.dateLabel ? { dateLabel: item.dateLabel } : {}),
      source: item.source ?? 'Wikimedia Commons',
      license,
      licenseUrl: stripHtml(meta.LicenseUrl?.value) || null,
      commonsTitle: title,
      sourceUrl: info.descriptionurl,
      width: out.info.width,
      height: out.info.height,
    },
    webp: out.data,
    metrics,
  };
}

const slug = (s) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);

async function loadEnvFile() {
  try {
    const text = await readFile(ENV_FILE, 'utf8');
    for (const line of text.split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  } catch {
    // файла нема — беремо лише змінні середовища
  }
}

async function configureCloudinary() {
  await loadEnvFile();
  const { CLOUDINARY_CLOUD_NAME: cloud, CLOUDINARY_API_KEY: key, CLOUDINARY_API_SECRET: secret } = process.env;
  if (!cloud || !key || !secret) {
    throw new Error('Задайте CLOUDINARY_CLOUD_NAME / CLOUDINARY_API_KEY / CLOUDINARY_API_SECRET (змінні середовища або backend/.env)');
  }
  cloudinary.config({ cloud_name: cloud, api_key: key, api_secret: secret, secure: true });
}

function uploadWebp(buffer, publicId) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder: CLOUDINARY_FOLDER, public_id: publicId, overwrite: true, resource_type: 'image' },
      (error, result) => (error || !result ? reject(error ?? new Error('Cloudinary: порожня відповідь')) : resolve(result)),
    );
    stream.end(buffer);
  });
}

export async function addItems(items, { dryRun = false } = {}) {
  const dataset = JSON.parse(await readFile(DATA_FILE, 'utf8'));
  if (!dryRun) await configureCloudinary();
  const report = { added: [], skipped: [], rejected: [] };
  const save = () => writeFile(DATA_FILE, `${JSON.stringify(dataset, null, 2)}\n`);
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
      if (!dryRun) await save();
      report.added.push(`${existing.id}  +${item.character} (та сама картина)`);
      continue;
    }
    try {
      const { record, webp, metrics } = await prepareRecord(item);
      const taken = dataset.images
        .filter((i) => i.id.startsWith(`${item.character}-`))
        .map((i) => Number(i.id.slice(item.character.length + 1).split('-')[0]) || 0);
      const n = Math.max(0, ...taken) + 1;
      const id = `${item.character}-${n}`;
      const note = `${record.author}, «${record.title}» (${record.license}, ${Math.round(webp.length / 1024)} KB, colour ${metrics.fraction.toFixed(2)}/${metrics.meanSaturation.toFixed(2)})`;
      if (dryRun) {
        report.added.push(`[dry-run] ${id}  ${note}`);
      } else {
        const uploaded = await uploadWebp(webp, `${id}-${slug(record.title)}`);
        dataset.images.push({
          id,
          characterIds: [item.character],
          url: uploaded.secure_url,
          cloudinaryId: uploaded.public_id,
          ...record,
        });
        // Зберігаємо після кожної картини: обрив на півдорозі не губить уже готове.
        await save();
        report.added.push(`${id}  ${note}`);
      }
    } catch (error) {
      report.rejected.push(`${title}: ${error.message}`);
    }
    await sleep(500);
  }
  return report;
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const envAt = args.indexOf('--env-file');
  if (envAt !== -1) ENV_FILE = path.resolve(args[envAt + 1]);
  let items = [];
  const listAt = args.indexOf('--list');
  if (listAt !== -1) {
    items = JSON.parse(await readFile(path.resolve(args[listAt + 1]), 'utf8'));
  } else {
    const charAt = args.indexOf('--character');
    const character = charAt !== -1 ? args[charAt + 1] : null;
    const files = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--character' && args[i - 1] !== '--env-file');
    if (!character || files.length === 0) {
      console.error('Використання: --character <id> "File:…"  |  --list <list.json>   [--dry-run] [--env-file <path>]');
      process.exit(2);
    }
    items = files.map((file) => ({ character, file }));
  }
  const report = await addItems(items, { dryRun });
  for (const line of report.added) console.log(`+ ${line}`);
  for (const line of report.skipped) console.log(`= вже є: ${line}`);
  for (const line of report.rejected) console.log(`! ${line}`);
  console.log(`\nДодано: ${report.added.length}, пропущено: ${report.skipped.length}, відхилено: ${report.rejected.length}`);
  if (report.rejected.length) process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
