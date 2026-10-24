import { FLOCK_CONFIG } from './flock.config';

const C = FLOCK_CONFIG;

/** Прохід через заборонену смугу (міст): по x. */
export interface NavGap {
  x0: number;
  x1: number;
}

/**
 * Заборонена зона для ШІ: горизонтальна смуга на всю ширину світу з проходами (мости). Зараз порожня;
 * лавова карта кладе сюди річку лави. ШІ (боти й Вожак) ходять лише через цей шар: не заходять у зону,
 * об'їжджають її мостами і не обирають цілі всередині.
 */
export interface NavHazard {
  y0: number;
  y1: number;
  gaps: NavGap[];
}

/** Мінімум світу, потрібний шару (реалізує FlockWorld). */
export interface NavWorld {
  hazards: NavHazard[];
}

/** Чи клітина радіуса r у точці (x, y) стоїть у забороненій зоні (поза проходом). */
export function inHazard(w: NavWorld, x: number, y: number, r = 0): boolean {
  for (const h of w.hazards) {
    if (y + r <= h.y0 || y - r >= h.y1) continue;
    let onGap = false;
    for (const g of h.gaps) {
      if (x - r >= g.x0 && x + r <= g.x1) {
        onGap = true;
        break;
      }
    }
    if (!onGap) return true;
  }
  return false;
}

/**
 * Відштовхування від країв світу й заборонених зон (вектор, довжина 0..~1 на межі поля margin).
 * Біля проходу зона не штовхає, якщо клітина вже стоїть у створі моста.
 */
export function navPush(
  w: NavWorld,
  x: number,
  y: number,
  r: number,
  margin: number,
  out: { x: number; y: number },
) {
  const W = C.worldSize;
  let px = 0;
  let py = 0;
  if (x < margin) px += (margin - x) / margin;
  if (x > W - margin) px -= (x - (W - margin)) / margin;
  if (y < margin) py += (margin - y) / margin;
  if (y > W - margin) py -= (y - (W - margin)) / margin;
  for (const h of w.hazards) {
    const m = margin + r;
    if (y < h.y0 - m || y > h.y1 + m) continue;
    let onGap = false;
    for (const g of h.gaps) {
      if (x - r >= g.x0 && x + r <= g.x1) {
        onGap = true;
        break;
      }
    }
    if (onGap) continue;
    // віддаль до краю смуги й напрямок «від неї»
    const mid = (h.y0 + h.y1) / 2;
    const toEdge = y < mid ? h.y0 - y : y - h.y1;
    const k = Math.min(2, (m - toEdge) / m + 0.2);
    py += (y < mid ? -1 : 1) * k;
  }
  out.x = px;
  out.y = py;
}

/**
 * Куди їхати, щоб дістатись цілі (tx, ty): якщо пряма перетинає заборонену смугу, повертає центр найближчого
 * до маршруту проходу (моста), інакше саму ціль. Одна дешева перевірка на смугу, без пошуку шляху.
 */
export function navRoute(
  w: NavWorld,
  x: number,
  y: number,
  tx: number,
  ty: number,
  r: number,
  out: { x: number; y: number },
) {
  out.x = tx;
  out.y = ty;
  for (const h of w.hazards) {
    const a = y < h.y0 ? -1 : y > h.y1 ? 1 : 0;
    const b = ty < h.y0 ? -1 : ty > h.y1 ? 1 : 0;
    if (a === b && a !== 0) continue;
    if (a === 0) continue; // уже в смузі (на мосту): їдемо як є
    if (b !== -a && b !== 0) continue;
    // цілимось у міст, найближчий за сумою шляху x -> міст -> ціль
    let best: NavGap | null = null;
    let bestCost = Infinity;
    for (const g of h.gaps) {
      if (g.x1 - g.x0 < r * 2) continue;
      const cx = (g.x0 + g.x1) / 2;
      const cost = Math.abs(cx - x) + Math.abs(cx - tx);
      if (cost < bestCost) {
        bestCost = cost;
        best = g;
      }
    }
    if (!best) continue;
    const cx = (best.x0 + best.x1) / 2;
    // доїхали до створу мосту - далі прямо через нього
    if (Math.abs(x - cx) <= (best.x1 - best.x0) / 2 - r) continue;
    out.x = cx;
    out.y = a < 0 ? h.y0 - r - 40 : h.y1 + r + 40;
    return;
  }
}
