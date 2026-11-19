#!/usr/bin/env node
/**
 * Генерує PNG для `apple-touch-startup-image`: фон «Ліс» (зелений) нового дизайну (див. DesignBackdrop /
 * styles/designV2.scss) + овечка (public/sheep-bubble.webp) по центру. Це статична картинка, яку iOS
 * показує до запуску будь-якого коду, тому анімації тут бути не може; далі SplashScreen показує ту
 * саму овечку вже анімованою.
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

const SHEEP_PATH = path.join(__dirname, "..", "public", "sheep-bubble.webp");
/** Ширина овечки відносно короткої сторони екрана. */
const SHEEP_SCALE = 0.5;

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

/** Градієнти повторюють фон «Ліс» (зелений) з designV2.scss (html[data-design-bg="forest"] [data-design-backdrop]). */
function splashSvg(width, height) {
  const glow = (id, cx, cy, rx, ry, color) => `<radialGradient id="${id}" gradientUnits="userSpaceOnUse" cx="${cx * width}" cy="${cy * height}" r="1" gradientTransform="translate(${cx * width} ${cy * height}) scale(${rx * width} ${ry * height}) translate(${-cx * width} ${-cy * height})"><stop offset="0" stop-color="${color}" /><stop offset="1" stop-color="${color}" stop-opacity="0" /></radialGradient>`;
  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="base" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0a1f16" /><stop offset="0.55" stop-color="#07150f" /><stop offset="1" stop-color="#040b08" /></linearGradient>
    ${glow("g1", 0.08, 0.14, 0.6, 0.4, "rgba(38,148,98,0.45)")}
    ${glow("g2", 0.96, 0.94, 0.55, 0.4, "rgba(24,112,76,0.42)")}
    ${glow("g3", 0.7, 0.08, 0.4, 0.3, "rgba(90,190,140,0.12)")}
  </defs>
  <rect width="${width}" height="${height}" fill="url(#base)" />
  <rect width="${width}" height="${height}" fill="url(#g1)" />
  <rect width="${width}" height="${height}" fill="url(#g2)" />
  <rect width="${width}" height="${height}" fill="url(#g3)" />
</svg>`;
}

async function renderOne(width, height) {
  const fileName = `apple-splash-${width}x${height}.png`;
  const sheepWidth = Math.round(Math.min(width, height) * SHEEP_SCALE);
  const sheep = await sharp(SHEEP_PATH).resize({ width: sheepWidth }).png().toBuffer();
  const { width: sw, height: sh } = await sharp(sheep).metadata();
  await sharp(Buffer.from(splashSvg(width, height)))
    .composite([{ input: sheep, left: Math.round((width - sw) / 2), top: Math.round((height - sh) / 2) }])
    .png()
    .toFile(path.join(OUT_DIR, fileName));
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
