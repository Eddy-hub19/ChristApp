/**
 * Куди повернути користувача після входу. Потрібно для посилань-запрошень у «Кіношку»:
 * незалогінений відкрив посилання → логін → назад у кімнату, а не в чати.
 */
const KEY = "christapp:post-login-path";

/** Приймаємо лише наші внутрішні шляхи, щоб сюди не можна було підсунути зовнішній redirect. */
function isAllowedPath(path: string) {
  return /^\/cinema\/join\/[A-Za-z0-9_-]+$/.test(path);
}

export function rememberPostLoginPath(path: string) {
  if (!isAllowedPath(path)) return;
  try {
    window.sessionStorage.setItem(KEY, path);
  } catch {
    // приватний режим — просто потрапить у чати
  }
}

export function forgetPostLoginPath() {
  try {
    window.sessionStorage.removeItem(KEY);
  } catch {
    // ігноруємо
  }
}

export function consumePostLoginPath(): string | null {
  try {
    const path = window.sessionStorage.getItem(KEY);
    window.sessionStorage.removeItem(KEY);
    return path && isAllowedPath(path) ? path : null;
  } catch {
    return null;
  }
}
