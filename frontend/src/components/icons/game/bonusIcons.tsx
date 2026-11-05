import type { ComponentType } from "react";
import type { ColorIconProps } from "./GameIconBase";
import {
  BoltIcon,
  DoubleIcon,
  EagleEyeIcon,
  FirefliesJarIcon,
  GhostIcon,
  GoldenFleeceIcon,
  LanternIcon,
  MagnetIcon,
  PipeIcon,
  RocketIcon,
  ScissorsIcon,
  ShieldIcon,
  SnowflakeIcon,
  WingsIcon,
} from "./icons";

/**
 * Єдина відповідність «вид бонуса -> іконка бібліотеки». Звідси беруть усі: поле гри (спрайт бонуса), HUD ефектів,
 * вікно «Про гру» й «Що нового». Новий бонус = одна іконка в icons.tsx + один рядок тут.
 */
export const BONUS_ICON_COMPONENTS: Record<string, ComponentType<ColorIconProps>> = {
  speed: BoltIcon,
  magnet: MagnetIcon,
  shield: ShieldIcon,
  ghost: GhostIcon,
  double: DoubleIcon,
  freeze: SnowflakeIcon,
  golden: GoldenFleeceIcon,
  scissors: ScissorsIcon,
  eagle: EagleEyeIcon,
  pipe: PipeIcon,
  lantern: LanternIcon,
  jar: FirefliesJarIcon,
  boost: RocketIcon,
  wings: WingsIcon,
  /** Заряд світла від їжі (лише в списку ефектів): та сама лампа, що й «Ліхтарик». */
  light: LanternIcon,
};

export function BonusIcon({ kind, ...props }: ColorIconProps & { kind: string }) {
  const Icon = BONUS_ICON_COMPONENTS[kind];
  return Icon ? <Icon {...props} /> : null;
}
