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
