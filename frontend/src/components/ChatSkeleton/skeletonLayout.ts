export type SkeletonItem = {
  side: "in" | "out";
  /** Ширина кожного рядка-смужки всередині пузиря, % від ширини пузиря. */
  lines: number[];
  /** Аватарка лише в останнього з підряд вхідних повідомлень. */
  showAvatar: boolean;
  /** Продовжує серію повідомлень однієї сторони — менший відступ зверху. */
  grouped: boolean;
};

type Template = { side: "in" | "out"; lines: number[] };

/** Знизу вгору: останній елемент — найближчий до поля введення. Порядок дає природний ритм чату. */
const TEMPLATE: Template[] = [
  { side: "in", lines: [78, 52, 34] },
  { side: "in", lines: [64] },
  { side: "out", lines: [58] },
  { side: "in", lines: [86, 70] },
  { side: "out", lines: [72, 40] },
  { side: "out", lines: [48] },
  { side: "in", lines: [56] },
  { side: "in", lines: [82, 66, 30] },
];

/** Середня висота елемента разом із проміжком, px: за нею рахуємо, скільки елементів заповнить висоту. */
export const SKELETON_ITEM_HEIGHT = 76;
/** Елементи «про запас» над видимою зоною: верх ніколи не лишається порожнім. */
export const SKELETON_EXTRA_ITEMS = 2;
export const SKELETON_FALLBACK_ITEMS = 8;

/** Скільки елементів потрібно, щоб із запасом перекрити контейнер заввишки `height` px. */
export function skeletonCountForHeight(height: number): number {
  if (!Number.isFinite(height) || height <= 0) return SKELETON_FALLBACK_ITEMS;
  return Math.ceil(height / SKELETON_ITEM_HEIGHT) + SKELETON_EXTRA_ITEMS;
}

/** Знизу вгору шаблон повторюється циклічно, тож будь-яку висоту можна заповнити. */
export function buildSkeletonLayout(count = SKELETON_FALLBACK_ITEMS): SkeletonItem[] {
  const size = Math.max(1, Math.floor(count));
  const picked: Template[] = [];
  for (let i = 0; i < size; i += 1) {
    picked.unshift(TEMPLATE[TEMPLATE.length - 1 - (i % TEMPLATE.length)]);
  }
  return picked.map((item, index) => ({
    side: item.side,
    lines: item.lines,
    grouped: index > 0 && picked[index - 1].side === item.side,
    showAvatar: item.side === "in" && picked[index + 1]?.side !== "in",
  }));
}
