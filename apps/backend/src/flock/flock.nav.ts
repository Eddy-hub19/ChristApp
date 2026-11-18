import { FLOCK_CONFIG } from './flock.config';

const C = FLOCK_CONFIG;
/** Відстань від бічного краю мосту, з якої ШІ відштовхується до середини. */
const EDGE_PUSH = 110;

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
        // на мосту біля бічного краю м'яко тягнемо до середини (лава за краєм)
        const edge = Math.min(x - g.x0, g.x1 - x);
        if (edge < EDGE_PUSH && y > h.y0 - r && y < h.y1 + r) {
          px += (x < (g.x0 + g.x1) / 2 ? 1 : -1) * ((EDGE_PUSH - edge) / EDGE_PUSH) * 2;
        }
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
 * Куди їхати, щоб дістатись цілі (tx, ty), коли між нами заборонена смуга: завжди через міст. Повертає точку,
 * у яку цілитись (інакше саму ціль). Усередині смуги (на мосту) тримає курс у межах мосту й веде до виходу на потрібний
 * бік, тож бічний знос до цілі не скидає з моста. Одна дешева перевірка на смугу, без пошуку шляху.
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
  // запас від бічного краю мосту: ШІ думає раз на кілька тіків і інерція зносить на десятки одиниць
  const pad = r + 70;
  for (const h of w.hazards) {
    const a = y < h.y0 ? -1 : y > h.y1 ? 1 : 0;
    const b = ty < h.y0 ? -1 : ty > h.y1 ? 1 : 0;
    if (a === b && a !== 0) continue;
    // міст: той, у стулі якого стоїмо, а ззовні - що дає найкоротший шлях x -> міст -> ціль
    let best: NavGap | null = null;
    let bestCost = Infinity;
    for (const g of h.gaps) {
      if (g.x1 - g.x0 < r * 2 + 30) continue;
      const cx = (g.x0 + g.x1) / 2;
      const cost =
        a === 0
          ? Math.max(0, g.x0 - x, x - g.x1)
          : Math.abs(cx - x) + Math.abs(cx - tx);
      if (cost < bestCost) {
        bestCost = cost;
        best = g;
      }
    }
    if (!best) continue;
    const cx = (best.x0 + best.x1) / 2;
    // на мосту, або над/під ним у його створі: ведемо до виходу на дальньому боці, не зсуваючись за край мосту
    const inner = Math.abs(x - cx) <= (best.x1 - best.x0) / 2 - pad;
    if (a === 0 || inner) {
      const exit = b !== 0 ? b : a !== 0 ? -a : 1;
      out.x = Math.min(best.x1 - pad, Math.max(best.x0 + pad, tx));
      out.y = exit < 0 ? h.y0 - r - 40 : h.y1 + r + 40;
      if (a === 0 && b === 0) out.y = ty;
      return;
    }
    // до створу мосту: біля нього ззовні
    out.x = cx;
    out.y = a < 0 ? h.y0 - r - 40 : h.y1 + r + 40;
    return;
  }
}

/** Чи промінь із (x, y) під кутом angle завдовжки dist потрапляє у заборонену смугу поза мостом (для рішення про ривок/поділ). */
export function navRayHits(w: NavWorld, x: number, y: number, angle: number, dist: number): boolean {
  if (w.hazards.length === 0) return false;
  const ca = Math.cos(angle);
  const sa = Math.sin(angle);
  for (let d = 40; d <= dist; d += 40) if (inHazard(w, x + ca * d, y + sa * d, 0)) return true;
  return false;
}

/**
 * Куди відходити «до центру» при застряганні: центр світу, а коли він у забороненій смузі (лава посередині) -
 * точка на тому ж боці смуги, посередині між краєм світу й смугою.
 */
export function navCenter(w: NavWorld, x: number, y: number, out: { x: number; y: number }) {
  const mid = C.worldSize / 2;
  out.x = mid;
  out.y = mid;
  for (const h of w.hazards) {
    if (mid > h.y0 && mid < h.y1) out.y = y < (h.y0 + h.y1) / 2 ? h.y0 / 2 : (h.y1 + C.worldSize) / 2;
  }
}

/**
 * Страховка від заходу в заборонену смугу: якщо за крок уперед (lookAhead) по бажаному напрямку (mx, my) клітина
 * (радіус r) опинилась би у смузі поза мостом, складову «до смуги» гасимо й підштовхуємо від неї - клітина ковзає
 * вздовж берега. У створі моста й усередині нього не втручається (міст веде routing).
 */
export function navSlide(
  w: NavWorld,
  x: number,
  y: number,
  r: number,
  mx: number,
  my: number,
  out: { x: number; y: number },
  lookAhead = 90,
) {
  out.x = mx;
  out.y = my;
  if (w.hazards.length === 0) return;
  const len = Math.hypot(mx, my) || 1;
  const lx = x + (mx / len) * lookAhead;
  const ly = y + (my / len) * lookAhead;
  for (const h of w.hazards) {
    // на мосту: не виходимо за бічні краї
    if (y > h.y0 - r && y < h.y1 + r) {
      for (const g of h.gaps) {
        if (x >= g.x0 && x <= g.x1) {
          if (lx < g.x0 + r * 0.5 || lx > g.x1 - r * 0.5) out.x = 0;
          return;
        }
      }
    }
    if (!inHazard(w, lx, ly, r) || inHazard(w, x, y, 0)) continue;
    const mid = (h.y0 + h.y1) / 2;
    const away = y < mid ? -1 : 1;
    // dy, що веде до смуги (від берега в бік центру смуги), не пропускаємо
    if ((my / len) * away < 0) out.y = away * 0.35 * len;
    else out.y = my;
    out.x = mx;
    return;
  }
}
