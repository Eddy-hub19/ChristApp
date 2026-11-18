/**
 * `apple-touch-startup-image` для iOS: тёмний екран із хрестом (як `ServerStartupScreen`),
 * що показується iOS одразу після тапу по іконці — доки Safari ще не намалював саму сторінку.
 * Без цього iOS малює порожній білий/чорний екран на час холодного старту вебвʼю.
 *
 * PNG згенеровані `scripts/generate-apple-splash.mjs` у `public/splash/`.
 *
 * iOS завжди звітує `device-width`/`device-height` у портретних (природних) CSS-пікселях,
 * незалежно від фактичної орієнтації — міняється лише `orientation` і розміри самого файлу.
 */
const DEVICE_PROFILES = [
  { w: 320, h: 568, dpr: 2 },
  { w: 375, h: 667, dpr: 2 },
  { w: 414, h: 736, dpr: 3 },
  { w: 375, h: 812, dpr: 3 },
  { w: 414, h: 896, dpr: 2 },
  { w: 414, h: 896, dpr: 3 },
  { w: 390, h: 844, dpr: 3 },
  { w: 428, h: 926, dpr: 3 },
  { w: 393, h: 852, dpr: 3 },
  { w: 430, h: 932, dpr: 3 },
] as const;

function mediaFor(
  w: number,
  h: number,
  dpr: number,
  orientation: "portrait" | "landscape",
): string {
  return (
    `screen and (device-width: ${w}px) and (device-height: ${h}px) ` +
    `and (-webkit-device-pixel-ratio: ${dpr}) and (orientation: ${orientation})`
  );
}

export const appleStartupImages = DEVICE_PROFILES.flatMap(({ w, h, dpr }) => {
  const portraitW = w * dpr;
  const portraitH = h * dpr;
  return [
    {
      url: `/splash/apple-splash-${portraitW}x${portraitH}.png`,
      media: mediaFor(w, h, dpr, "portrait"),
    },
    {
      url: `/splash/apple-splash-${portraitH}x${portraitW}.png`,
      media: mediaFor(w, h, dpr, "landscape"),
    },
  ];
});
