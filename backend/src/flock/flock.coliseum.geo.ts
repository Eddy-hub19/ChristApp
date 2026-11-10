import { FLOCK_CONFIG } from './flock.config';

const K = FLOCK_CONFIG.coliseum;

/** Геометрія «Арени»: одна для сервера (стріли, спавн) і клієнта (welcome). Колони й камні - [x, y, r]. */
export function coliseumGeometry() {
  const cx = FLOCK_CONFIG.worldSize / 2;
  const cy = cx;
  const pillars: [number, number, number][] = [];
  for (let i = 0; i < K.pillarCount; i++) {
    const ang = (i / K.pillarCount) * Math.PI * 2 + Math.PI / K.pillarCount;
    pillars.push([Math.round(cx + Math.cos(ang) * K.pillarRing), Math.round(cy + Math.sin(ang) * K.pillarRing), K.pillarRadius]);
  }
  const stones: [number, number, number][] = [];
  for (let i = 0; i < K.stoneCount; i++) {
    const ang = i * 2.399963 + 0.7; // золотий кут: рівномірний розсип
    const d = 140 + ((i * 97) % 7) * 70;
    stones.push([Math.round(cx + Math.cos(ang) * d), Math.round(cy + Math.sin(ang) * d), 14 + ((i * 5) % 4) * 6]);
  }
  return { cx, cy, r: K.radius, pillars, stones };
}
