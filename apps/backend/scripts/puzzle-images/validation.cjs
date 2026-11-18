/**
 * Правила відбору картин для «Пазлів» — спільні для скрипта імпорту (ESM) і тестів (Jest).
 * Чистий JS без залежностей.
 */
/** Менше — розмивається на пазлі з 96 кусочків, тож такі файли не беремо. */
const MIN_LONG_SIDE = 1000;
/** Приймаємо лише вільні ліцензії; CC BY(-SA) не береться навіть з атрибуцією. */
const ALLOWED_LICENSE = /^(public domain|pd[- ]|pd$|cc0)/i;
/**
 * Кольоровість: частка «насичених» пікселів (насиченість ≥ 0,28 і яскравість ≥ 0,2) і середня насиченість
 * зменшеної копії 64×64. Чорно-білі гравюри дають ~0, сепійні рисунки — frac < 0,07 і meanSat ≈ 0,1,
 * кольорові акварелі — frac > 0,13 і meanSat > 0,17.
 */
const COLOR_MIN_FRACTION = 0.1;
const COLOR_MIN_MEAN_SATURATION = 0.14;

/** `rgb` — сирі RGB-байти (3 на піксель). */
function colorMetrics(rgb) {
  const pixels = rgb.length / 3;
  let colorful = 0;
  let satSum = 0;
  for (let i = 0; i < rgb.length; i += 3) {
    const max = Math.max(rgb[i], rgb[i + 1], rgb[i + 2]);
    const min = Math.min(rgb[i], rgb[i + 1], rgb[i + 2]);
    const s = max === 0 ? 0 : (max - min) / max;
    satSum += s;
    if (s >= 0.28 && max / 255 >= 0.2) colorful += 1;
  }
  return { fraction: colorful / pixels, meanSaturation: satSum / pixels };
}

function isColorful(metrics) {
  return (
    metrics.fraction >= COLOR_MIN_FRACTION &&
    metrics.meanSaturation >= COLOR_MIN_MEAN_SATURATION
  );
}

function isAllowedLicense(license) {
  return typeof license === 'string' && ALLOWED_LICENSE.test(license.trim());
}

module.exports = {
  MIN_LONG_SIDE,
  ALLOWED_LICENSE,
  COLOR_MIN_FRACTION,
  COLOR_MIN_MEAN_SATURATION,
  colorMetrics,
  isColorful,
  isAllowedLicense,
};
