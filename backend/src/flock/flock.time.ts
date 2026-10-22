/** Зсув часового поясу від UTC (мс) у момент `at`. */
function zoneOffsetMs(at: number, timeZone: string): number {
  const f = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
  });
  const v: Record<string, number> = {};
  for (const p of f.formatToParts(new Date(at)))
    if (p.type !== 'literal') v[p.type] = Number(p.value);
  const asUtc = Date.UTC(v.year, v.month - 1, v.day, v.hour, v.minute, v.second);
  return asUtc - Math.floor(at / 1000) * 1000;
}

/** Початок поточної доби (00:00) у заданому часовому поясі, як момент UTC. Враховує перехід на літній час. */
export function dayStartInZone(now: Date, timeZone: string): Date {
  const t = now.getTime();
  const off = zoneOffsetMs(t, timeZone);
  const local = new Date(t + off);
  const midnightLocal = Date.UTC(
    local.getUTCFullYear(),
    local.getUTCMonth(),
    local.getUTCDate(),
  );
  // зсув на самій півночі може відрізнятись (ніч переведення годинника)
  const guess = midnightLocal - off;
  return new Date(midnightLocal - zoneOffsetMs(guess, timeZone));
}

/** Ключ доби "YYYY-MM-DD" у заданому часовому поясі. */
export function dayKeyInZone(at: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(at);
}

/** Ключ сусідньої доби (delta = ±1) за ключем "YYYY-MM-DD" (календарна арифметика, без часових поясів). */
export function shiftDayKey(key: string, delta: number): string {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + delta)).toISOString().slice(0, 10);
}

/** Початок наступної доби в поясі (+36 год від початку поточної завжди потрапляє в наступну добу, навіть при переході на літній час). */
export function nextDayStartInZone(now: Date, timeZone: string): Date {
  const start = dayStartInZone(now, timeZone);
  return dayStartInZone(new Date(start.getTime() + 36 * 3_600_000), timeZone);
}
