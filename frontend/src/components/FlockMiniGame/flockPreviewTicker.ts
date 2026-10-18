/**
 * Єдиний таймер для анімованих прев'ю скінів у лобі (8 разів на секунду) замість окремого інтервалу на кожну кнопку.
 * Не тікає, коли вкладка прихована або підписників нема.
 */
const INTERVAL_MS = 125;
const subs = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;

function tick() {
  if (typeof document !== "undefined" && document.hidden) return;
  subs.forEach((cb) => cb());
}

export function subscribePreviewTick(cb: () => void): () => void {
  subs.add(cb);
  if (!timer) timer = setInterval(tick, INTERVAL_MS);
  return () => {
    subs.delete(cb);
    if (subs.size === 0 && timer) {
      clearInterval(timer);
      timer = null;
    }
  };
}
