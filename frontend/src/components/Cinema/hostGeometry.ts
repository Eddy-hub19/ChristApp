export type Rect = { left: number; top: number; width: number; height: number };
export type Offset = { dx: number; dy: number };

export const NO_OFFSET: Offset = { dx: 0, dy: 0 };
/** Розбіжність менша за це (px) — не помилка, а округлення. */
export const HOST_TOLERANCE_PX = 0.5;

const round = (n: number) => Math.round(n * 10) / 10;

export function roundRect(r: Rect): Rect {
  return { left: round(r.left), top: round(r.top), width: round(r.width), height: round(r.height) };
}

export function sameRect(a: Rect | null, b: Rect | null): boolean {
  return (
    a === b ||
    (a !== null &&
      b !== null &&
      a.left === b.left &&
      a.top === b.top &&
      a.width === b.width &&
      a.height === b.height)
  );
}

/** Рамка, яку треба виставити хосту, щоб після зсуву `offset` він накрив слот `slot`. */
export function hostStyleRect(slot: Rect, offset: Offset): Rect {
  return {
    left: round(slot.left + offset.dx),
    top: round(slot.top + offset.dy),
    width: slot.width,
    height: slot.height,
  };
}

/**
 * Замкнений контур: порівнюємо, де хост ФАКТИЧНО опинився (getBoundingClientRect), зі слотом і
 * дозбираємо зсув. На iOS із клавіатурою `position: fixed` і клієнтські координати можуть мати різний
 * початок відліку (visualViewport.offsetTop/offsetLeft) — так хост накриває слот попри це, без
 * здогадок про конкретний пристрій. Повертає той самий `offset`, якщо розбіжності немає.
 */
export function nextHostOffset(offset: Offset, slot: Rect, actual: Rect): Offset {
  const errX = slot.left - actual.left;
  const errY = slot.top - actual.top;
  if (Math.abs(errX) <= HOST_TOLERANCE_PX && Math.abs(errY) <= HOST_TOLERANCE_PX) return offset;
  return { dx: round(offset.dx + errX), dy: round(offset.dy + errY) };
}
