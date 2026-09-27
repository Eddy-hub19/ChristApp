#!/usr/bin/env node
/**
 * Генерує PNG для `apple-touch-startup-image`: тёмний фон застосунку + хрест по центру,
 * в стилі екрана завантаження (SplashScreen/ServerStartupScreen), щоб iOS показував його
 * замість порожнього білого/чорного екрана під час холодного старту PWA.
 *
 * Запуск: node scripts/generate-apple-splash.mjs
 * Вихід: public/splash/apple-splash-<width>x<height>.png (по одному на кожну орієнтацію профілю).
 */
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, "..", "public", "splash");

const BG = "#2e2d2d";
const CROSS = "#d4af37";

/** Логічні (CSS) розміри портрету + пікс. щільність — iOS завжди звітує device-width/height у портретній орієнтації. */
export const DEVICE_PROFILES = [
  { id: "se1", w: 320, h: 568, dpr: 2 },
  { id: "classic", w: 375, h: 667, dpr: 2 },
  { id: "classic-plus", w: 414, h: 736, dpr: 3 },
  { id: "x", w: 375, h: 812, dpr: 3 },
  { id: "xr", w: 414, h: 896, dpr: 2 },
  { id: "xs-max", w: 414, h: 896, dpr: 3 },
  { id: "12", w: 390, h: 844, dpr: 3 },
  { id: "12-pro-max", w: 428, h: 926, dpr: 3 },
  { id: "14-pro", w: 393, h: 852, dpr: 3 },
  { id: "14-pro-max", w: 430, h: 932, dpr: 3 },
];

function splashSvg(width, height) {
  const shortSide = Math.min(width, height);
  const crossHalf = shortSide * 0.09;
  const stroke = Math.max(6, shortSide * 0.02);
  const cx = width / 2;
  const cy = height / 2;
  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${width}" height="${height}" fill="${BG}" />
  <path d="M ${cx} ${cy - crossHalf} V ${cy + crossHalf} M ${cx - crossHalf} ${cy - crossHalf * 0.25} H ${cx + crossHalf}" fill="none" stroke="${CROSS}" stroke-width="${stroke}" stroke-linecap="round" />
</svg>`;
}

async function renderOne(width, height) {
  const fileName = `apple-splash-${width}x${height}.png`;
  const svg = splashSvg(width, height);
  await sharp(Buffer.from(svg)).png().toFile(path.join(OUT_DIR, fileName));
  return fileName;
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const written = [];
  for (const profile of DEVICE_PROFILES) {
    const portraitW = profile.w * profile.dpr;
    const portraitH = profile.h * profile.dpr;
    written.push(await renderOne(portraitW, portraitH));
    written.push(await renderOne(portraitH, portraitW));
  }
  for (const fileName of written) {
    console.log("wrote", fileName);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
