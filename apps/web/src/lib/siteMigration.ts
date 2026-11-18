/** Переезд на новый домен: адрес нового сайта и момент, когда старый перестанет работать. */
export const NEW_SITE_ORIGIN = "https://christapp.ddns.net";

/** Дедлайн (UTC): 24 часа с момента запуска таймера. Один и тот же момент для всех пользователей. */
export const OLD_SITE_SHUTDOWN_AT = "2026-11-19T18:10:00Z";

export const NEW_SITE_HOST = new URL(NEW_SITE_ORIGIN).hostname;
export const SHUTDOWN_MS = new Date(OLD_SITE_SHUTDOWN_AT).getTime();

export function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** Миллисекунды → часы/минуты/секунды (не меньше нуля). */
export function splitDuration(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  return {
    h: Math.floor(total / 3600),
    m: Math.floor((total % 3600) / 60),
    s: total % 60,
  };
}
