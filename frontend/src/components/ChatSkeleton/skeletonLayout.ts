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

export const SKELETON_MIN_ITEMS = 6;
export const SKELETON_MAX_ITEMS = 8;

export function buildSkeletonLayout(count = SKELETON_MAX_ITEMS): SkeletonItem[] {
  const size = Math.min(SKELETON_MAX_ITEMS, Math.max(SKELETON_MIN_ITEMS, count));
  const picked = TEMPLATE.slice(-size);
  return picked.map((item, index) => ({
    side: item.side,
    lines: item.lines,
    grouped: index > 0 && picked[index - 1].side === item.side,
    showAvatar: item.side === "in" && picked[index + 1]?.side !== "in",
  }));
}
