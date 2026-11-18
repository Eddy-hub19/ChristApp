import type { ComponentType } from "react";
import { DoodleIcon, FilwordIcon, FlockIcon, GuessIcon, PuzzleIcon, SnakeIcon, type ColorIconProps } from "@/components/icons/game";
import type { GameId } from "./gameRegistry";

const GAME_ICONS: Record<GameId, ComponentType<ColorIconProps>> = {
  doodle: DoodleIcon,
  snake: SnakeIcon,
  filword: FilwordIcon,
  guess: GuessIcon,
  puzzle: PuzzleIcon,
  flock: FlockIcon,
};

type GameIconProps = ColorIconProps & { game: GameId };

/** Єдина кольорова іконка гри для меню, карток, статусу «грає…». Колір не залежить від currentColor; `muted` — для неактивного стану. */
export default function GameIcon({ game, size = 18, ...rest }: GameIconProps) {
  const Icon = GAME_ICONS[game];
  return <Icon size={size} {...rest} />;
}
