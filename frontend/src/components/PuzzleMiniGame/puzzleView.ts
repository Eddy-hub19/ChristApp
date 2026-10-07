/** Чиста «вьюшна» математика пазла (камера, інтерполяція, форматування) — без DOM, щоб її можна було тестувати. */
export type World = { minX: number; minY: number; maxX: number; maxY: number };
/** `x`, `y` — де на екрані (у CSS-пікселях) лежить початок світу; `scale` — пікселів на одиницю поля. */
export type Camera = { scale: number; x: number; y: number };

export const MAX_ZOOM_OVER_FIT = 10;
export const MIN_ZOOM_OVER_FIT = 0.7;

export function fitCamera(world: World, viewW: number, viewH: number, padding = 12): Camera {
  const w = world.maxX - world.minX;
  const h = world.maxY - world.minY;
  const scale = Math.max(
    0.01,
    Math.min((viewW - padding * 2) / w, (viewH - padding * 2) / h),
  );
  return {
    scale,
    x: (viewW - w * scale) / 2 - world.minX * scale,
    y: (viewH - h * scale) / 2 - world.minY * scale,
  };
}

/** Камера, що показує прямокутник (напр., зібрану картину) у центрі екрана. */
export function fitRect(
  rect: { x: number; y: number; w: number; h: number },
  viewW: number,
  viewH: number,
  padding = 24,
): Camera {
  const scale = Math.max(
    0.01,
    Math.min((viewW - padding * 2) / rect.w, (viewH - padding * 2) / rect.h),
  );
  return {
    scale,
    x: (viewW - rect.w * scale) / 2 - rect.x * scale,
    y: (viewH - rect.h * scale) / 2 - rect.y * scale,
  };
}

export function screenToWorld(cam: Camera, sx: number, sy: number) {
  return { x: (sx - cam.x) / cam.scale, y: (sy - cam.y) / cam.scale };
}

export function worldToScreen(cam: Camera, wx: number, wy: number) {
  return { x: wx * cam.scale + cam.x, y: wy * cam.scale + cam.y };
}

/** Зум навколо точки екрана: точка світу під пальцями/курсором лишається на місці. */
export function zoomAt(cam: Camera, factor: number, sx: number, sy: number, fit: Camera): Camera {
  const next = Math.min(
    Math.max(cam.scale * factor, fit.scale * MIN_ZOOM_OVER_FIT),
    fit.scale * MAX_ZOOM_OVER_FIT,
  );
  const world = screenToWorld(cam, sx, sy);
  return { scale: next, x: sx - world.x * next, y: sy - world.y * next };
}

/** Не даємо відвезти поле так далеко, що його не видно: центр світу лишається на екрані. */
export function clampCamera(cam: Camera, world: World, viewW: number, viewH: number): Camera {
  const cx = ((world.minX + world.maxX) / 2) * cam.scale + cam.x;
  const cy = ((world.minY + world.maxY) / 2) * cam.scale + cam.y;
  const dx = Math.min(Math.max(cx, 0), viewW) - cx;
  const dy = Math.min(Math.max(cy, 0), viewH) - cy;
  return dx === 0 && dy === 0 ? cam : { ...cam, x: cam.x + dx, y: cam.y + dy };
}

/** Експоненційне наближення до цілі: не залежить від частоти кадрів. Повертає нову позицію й чи вже «доїхали». */
export function stepToward(
  current: number,
  target: number,
  dtMs: number,
  tauMs = 70,
  epsilon = 0.2,
): { value: number; done: boolean } {
  const alpha = 1 - Math.exp(-Math.max(0, dtMs) / tauMs);
  const value = current + (target - current) * alpha;
  if (Math.abs(target - value) <= epsilon) return { value: target, done: true };
  return { value, done: false };
}

export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const s = total % 60;
  const m = Math.floor(total / 60) % 60;
  const h = Math.floor(total / 3600);
  const two = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${two(m)}:${two(s)}` : `${m}:${two(s)}`;
}

/** Скільки кусочків уже на своїх місцях (у покладеній групі). */
export function placedCount(groups: Array<{ placed: boolean; pieces: unknown[] }>): number {
  return groups.reduce((sum, g) => sum + (g.placed ? g.pieces.length : 0), 0);
}

/** Скільки кусочків уже з'єднано з іншими (групи з двох і більше) або покладено. */
export function connectedCount(groups: Array<{ placed: boolean; pieces: unknown[] }>): number {
  return groups.reduce((sum, g) => sum + (g.placed || g.pieces.length > 1 ? g.pieces.length : 0), 0);
}
