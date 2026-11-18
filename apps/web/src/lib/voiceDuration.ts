/** Тривалість голосового для відправки: скінченне число повних секунд або undefined. */
export function sanitizeVoiceDuration(
  ...candidates: Array<number | string | null | undefined>
): number | undefined {
  for (const candidate of candidates) {
    const value = typeof candidate === "string" ? Number(candidate) : candidate;
    if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
      return Math.round(value);
    }
  }
  return undefined;
}

/**
 * Тривалість за таймером запису (старт → зупинка), а не з audio.duration:
 * на iOS у mp4 вона невідома (NaN/Infinity) до появи метаданих.
 */
export function voiceDurationFromTimer(
  recordedMs: number | undefined,
  timerSeconds?: number,
): number | undefined {
  return sanitizeVoiceDuration(
    recordedMs != null ? recordedMs / 1000 : undefined,
    timerSeconds,
  );
}
