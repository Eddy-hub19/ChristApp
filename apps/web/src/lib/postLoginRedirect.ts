/**
 * Куди повернути користувача після входу. Потрібно для посилань-запрошень («Кіношка», «Отара»):
 * незалогінений відкрив посилання → логін → назад до запрошення, а не в чати.
 *
 * Шлях пишемо і в sessionStorage, і в localStorage (з часом): на iOS посилання з іншого застосунку
 * відкривається в Safari, а вхід/реєстрація іноді відбувається в іншій вкладці.
 */
const KEY = "christapp:post-login-path";
const KEY_LOCAL = "christapp:post-login-path:local";
const LOCAL_TTL_MS = 30 * 60_000;

/** Приймаємо лише наші внутрішні шляхи, щоб сюди не можна було підсунути зовнішній redirect. */
function isAllowedPath(path: string) {
  return /^\/cinema\/join\/[A-Za-z0-9_-]+$/.test(path) || /^\/games\/flock(\?arena=\d{1,9})?$/.test(path);
}

export function rememberPostLoginPath(path: string) {
  if (!isAllowedPath(path)) return;
  try {
    window.sessionStorage.setItem(KEY, path);
  } catch {
    // приватний режим — просто потрапить у чати
  }
  try {
    window.localStorage.setItem(KEY_LOCAL, JSON.stringify({ path, at: Date.now() }));
  } catch {
    // ігноруємо
  }
}

export function forgetPostLoginPath() {
  try {
    window.sessionStorage.removeItem(KEY);
  } catch {
    // ігноруємо
  }
  try {
    window.localStorage.removeItem(KEY_LOCAL);
  } catch {
    // ігноруємо
  }
}

export function consumePostLoginPath(): string | null {
  let path: string | null = null;
  try {
    path = window.sessionStorage.getItem(KEY);
  } catch {
    path = null;
  }
  if (!path) {
    try {
      const raw = window.localStorage.getItem(KEY_LOCAL);
      const parsed = raw ? (JSON.parse(raw) as { path?: string; at?: number }) : null;
      if (parsed?.path && typeof parsed.at === "number" && Date.now() - parsed.at < LOCAL_TTL_MS) {
        path = parsed.path;
      }
    } catch {
      path = null;
    }
  }
  forgetPostLoginPath();
  return path && isAllowedPath(path) ? path : null;
}
