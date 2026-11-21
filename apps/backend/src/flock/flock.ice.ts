/**
 * Карта «Зимовий мороз»: невеликий каток по центру світу. Лід тріскається під клітиною, що на ньому стоїть: у клітини є «тріщини»
 * (0..1), вони ростуть, поки її центр на льоду, і спадають, коли вона зійшла. Чим більша маса, тим швидше тріскається:
 * час до провалу = maxSec * massHalf / (massHalf + маса), але не менше minSec. Дійшло до 1 - клітина провалилась під лід.
 * Сервер і клієнт рахують однією формулою (iceFallSec, iceStep); сервер авторитетний.
 */
export interface IceRink {
  x: number;
  y: number;
  r: number;
}

export interface IceCfg {
  radius: number;
  /** Секунд до провалу для найлегшої клітини й мінімум для найважчої. */
  maxSec: number;
  minSec: number;
  /** Маса, при якій час до провалу вдвічі менший за maxSec. */
  massHalf: number;
  /** Швидкість «загоювання» тріщин, коли клітина зійшла з льоду (частка за секунду). */
  recoverPerSec: number;
}

export function iceRinkAt(worldSize: number, cfg: IceCfg): IceRink {
  return { x: worldSize / 2, y: worldSize / 2, r: cfg.radius };
}

export function inIce(rink: IceRink, x: number, y: number, margin = 0): boolean {
  return Math.hypot(x - rink.x, y - rink.y) < rink.r + margin;
}

/** Скільки секунд лід витримує клітину цієї маси. */
export function iceFallSec(mass: number, cfg: Pick<IceCfg, 'maxSec' | 'minSec' | 'massHalf'>): number {
  return Math.max(cfg.minSec, (cfg.maxSec * cfg.massHalf) / (cfg.massHalf + Math.max(0, mass)));
}

/** Нове значення тріщин (0..1) за dt секунд: ростуть на льоду, спадають поза ним. */
export function iceStep(
  level: number,
  onIce: boolean,
  mass: number,
  dt: number,
  cfg: Pick<IceCfg, 'maxSec' | 'minSec' | 'massHalf' | 'recoverPerSec'>,
): number {
  return onIce
    ? Math.min(1, level + dt / iceFallSec(mass, cfg))
    : Math.max(0, level - dt * cfg.recoverPerSec);
}
