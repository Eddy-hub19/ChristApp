/** Бонусы «особенных» скинов: числа приходят с сервера (config.game.skinPerks, дзеркало FLOCK_CONFIG.skinPerks). */
export type SkinPerks = Partial<Record<PerkKey, number>>;

export const PERK_KEYS = [
  "foodReach",
  "decaySlow",
  "speed",
  "bonusDuration",
  "spawnBoostBonus",
  "spawnBoostMs",
  "foodMass",
  "grassFlowerMass",
  "shieldBonusMs",
  "sprintBurnLess",
  "freezeLess",
  "puddleLess",
] as const;
export type PerkKey = (typeof PERK_KEYS)[number];

/** Иконка строки бонуса. */
export const PERK_ICON: Record<PerkKey, string> = {
  foodReach: "🧲",
  decaySlow: "⏳",
  speed: "⚡",
  bonusDuration: "✨",
  spawnBoostBonus: "🚀",
  spawnBoostMs: "🚀",
  foodMass: "🌿",
  grassFlowerMass: "🌼",
  shieldBonusMs: "🛡️",
  sprintBurnLess: "💨",
  freezeLess: "❄️",
  puddleLess: "☔",
};

/** Бонусы скина из конфига игры (пусто - у скина нет бонуса). */
export function perksOf(game: Record<string, unknown> | undefined, skin: number): SkinPerks {
  const all = game?.skinPerks as Record<string, SkinPerks> | undefined;
  return all?.[String(skin)] ?? {};
}

/** Значение для подписи: доли - проценты, миллисекунды - секунды. */
export function perkValue(key: PerkKey, v: number): number {
  return key === "spawnBoostMs" || key === "shieldBonusMs" ? Math.round(v / 100) / 10 : Math.round(v * 100);
}

/** Список бонусов скина в порядке PERK_KEYS. */
export function perkList(game: Record<string, unknown> | undefined, skin: number): { key: PerkKey; value: number }[] {
  const p = perksOf(game, skin);
  return PERK_KEYS.flatMap((key) => (typeof p[key] === "number" ? [{ key, value: perkValue(key, p[key] as number) }] : []));
}
