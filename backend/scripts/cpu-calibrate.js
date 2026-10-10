#!/usr/bin/env node
/**
 * Скільки разів це ядро повільніше за еталонний ноутбук (Apple M2), на якому мірялась "Отара".
 * Запустіть на Render (Shell): `node scripts/cpu-calibrate.js`. Число `slowdown` підставте в оцінку:
 *   CPU арени на Render ≈ (мс CPU/с з docs/flock-perf.md) × slowdown, а бюджет безкоштовного тарифу - ~100 мс/с.
 * Навантаження - суміш арифметики, Map і Buffer (схоже на тік арени й socket.io), без залежностей.
 */
const REF_M2_MS = 5.8; // медіана на Apple M2 (3 запуски: 5.7-6.0 мс)
function work() {
  let acc = 0;
  const m = new Map();
  for (let i = 0; i < 400000; i++) {
    acc += Math.hypot(i % 97, i % 31) + Math.sqrt(i);
    if (i % 4 === 0) m.set(i & 4095, acc);
  }
  const b = Buffer.alloc(65536);
  for (let r = 0; r < 60; r++) for (let i = 0; i < b.length; i += 7) b[i] = (acc + i) & 255;
  return acc + m.size;
}
const runs = [];
for (let i = 0; i < 9; i++) {
  const t = process.hrtime.bigint();
  work();
  runs.push(Number(process.hrtime.bigint() - t) / 1e6);
}
runs.sort((a, b) => a - b);
const med = runs[4];
const ref = Number(process.env.REF_M2_MS || REF_M2_MS);
console.log(`медіана ${med.toFixed(1)} мс` + (ref ? `; еталон M2 ${ref} мс; slowdown ≈ ${(med / ref).toFixed(2)}x` : ' (еталон не заданий)'));
