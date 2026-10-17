/**
 * Коли показувати плашку «Установити застосунок». Чиста логіка (без DOM) — щоб її можна було тестувати з підміною часу.
 * Стан у localStorage: час останнього закриття, скільки разів поспіль закрили, і прапор «вже встановлено».
 */

export const PWA_STATE_KEY = "christapp_pwa_install_v2";
/** Ключ старої iOS-підказки (21 день) — поважаємо закриття, зроблені до цієї зміни. */
const LEGACY_IOS_KEY = "christapp_pwa_ios_hint_v1";

export const PWA_DISMISS_BASE_MS = 24 * 60 * 60 * 1000;
export const PWA_DISMISS_LONG_MS = 7 * 24 * 60 * 60 * 1000;
/** Після скількох закриттів поспіль пауза росте з доби до тижня. */
export const PWA_LONG_PAUSE_AFTER = 3;
/** Не показуємо в перші секунди після відкриття застосунку. */
export const PWA_MIN_SESSION_MS = 30_000;

export type PwaInstallState = {
  /** Момент останнього закриття плашки (ms epoch); 0 — ще не закривали. */
  dismissedAt: number;
  /** Закриттів поспіль. */
  dismissCount: number;
  /** Отримали appinstalled / відкрито як встановлений застосунок — більше не показуємо. */
  installed: boolean;
};

export const EMPTY_PWA_STATE: PwaInstallState = { dismissedAt: 0, dismissCount: 0, installed: false };

type StorageLike = Pick<Storage, "getItem" | "setItem">;

function defaultStorage(): StorageLike | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

export function readPwaState(storage: StorageLike | null = defaultStorage()): PwaInstallState {
  if (!storage) return EMPTY_PWA_STATE;
  try {
    const raw = storage.getItem(PWA_STATE_KEY);
    if (raw) {
      const p = JSON.parse(raw) as Partial<PwaInstallState>;
      return {
        dismissedAt: typeof p.dismissedAt === "number" ? p.dismissedAt : 0,
        dismissCount: typeof p.dismissCount === "number" ? p.dismissCount : 0,
        installed: p.installed === true,
      };
    }
    const legacy = storage.getItem(LEGACY_IOS_KEY);
    if (legacy) {
      const at = (JSON.parse(legacy) as { at?: number }).at;
      if (typeof at === "number") return { dismissedAt: at, dismissCount: 1, installed: false };
    }
  } catch {
    /* пошкоджений запис — як чистий стан */
  }
  return EMPTY_PWA_STATE;
}

function write(state: PwaInstallState, storage: StorageLike | null): PwaInstallState {
  try {
    storage?.setItem(PWA_STATE_KEY, JSON.stringify(state));
  } catch {
    /* приватний режим тощо */
  }
  return state;
}

export function recordDismiss(
  now: number,
  storage: StorageLike | null = defaultStorage(),
): PwaInstallState {
  const prev = readPwaState(storage);
  return write({ ...prev, dismissedAt: now, dismissCount: prev.dismissCount + 1 }, storage);
}

export function recordInstalled(storage: StorageLike | null = defaultStorage()): PwaInstallState {
  return write({ ...readPwaState(storage), installed: true }, storage);
}

/** Пауза після закриття: доба; після трьох закриттів поспіль — тиждень. */
export function dismissPauseMs(dismissCount: number): number {
  if (dismissCount <= 0) return 0;
  return dismissCount >= PWA_LONG_PAUSE_AFTER ? PWA_DISMISS_LONG_MS : PWA_DISMISS_BASE_MS;
}

/** Екрани, де плашка заважає: ігри, зал кінотеатру (список кімнат `/cinema` — можна), офлайн. */
export function isInstallPromptBlockedPath(pathname: string | null | undefined): boolean {
  const p = (pathname ?? "").replace(/\/+$/, "") || "/";
  return (
    p === "/offline" ||
    p === "/games" ||
    p.startsWith("/games/") ||
    p === "/app/catch" ||
    p.startsWith("/app/catch/") ||
    p.startsWith("/cinema/")
  );
}

export type PwaGateContext = {
  now: number;
  /** Скільки мс минуло від відкриття застосунку (performance.now()). */
  sessionMs: number;
  pathname: string | null | undefined;
  /** display-mode: standalone / navigator.standalone. */
  standalone: boolean;
  fullscreen: boolean;
  /** Відкрита модалка/шторка (`[role=dialog]`, `dialog[open]`). */
  modalOpen: boolean;
  visible: boolean;
  state: PwaInstallState;
};

/** Чи можна показати плашку просто зараз. */
export function canShowInstallPrompt(ctx: PwaGateContext): boolean {
  const { state } = ctx;
  if (ctx.standalone || state.installed) return false;
  if (!ctx.visible || ctx.fullscreen || ctx.modalOpen) return false;
  if (isInstallPromptBlockedPath(ctx.pathname)) return false;
  if (ctx.sessionMs < PWA_MIN_SESSION_MS) return false;
  if (state.dismissedAt > 0 && ctx.now - state.dismissedAt < dismissPauseMs(state.dismissCount)) {
    return false;
  }
  return true;
}
