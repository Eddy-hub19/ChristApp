import { ChevronsUp, Grid3x3, Puzzle, UserSearch, Worm, type LucideProps } from "lucide-react";
import type { ComponentType } from "react";
import type { GameId } from "./gameRegistry";

/** Лінійна овечка в стилі lucide (24×24, round caps/joins) — у lucide такої іконки немає. */
export function Sheep({ size = 24, strokeWidth = 2, className, ...rest }: LucideProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      {...rest}
    >
      <path d="M5.5 17a2.8 2.8 0 0 1-1.6-5.1 3 3 0 0 1 4.4-3.4 3 3 0 0 1 5 1.3A2.8 2.8 0 0 1 13 17z" />
      <path d="M7 17v3.5M11.5 17v3.5" />
      <path d="M16.5 10.5h2.2a2 2 0 0 1 2 2.2l-.4 2.3a2 2 0 0 1-2 1.7h-.3a2 2 0 0 1-1.6-.8" />
      <path d="M16.5 10.5 15 9.2" />
      <path d="M18.7 13h.01" />
    </svg>
  );
}

const GAME_ICONS: Record<GameId, ComponentType<LucideProps>> = {
  doodle: ChevronsUp,
  snake: Worm,
  filword: Grid3x3,
  guess: UserSearch,
  puzzle: Puzzle,
  flock: Sheep,
};

type GameIconProps = LucideProps & { game: GameId };

/** Єдина іконка гри для меню, карток, статусу «грає…». Колір — currentColor. */
export default function GameIcon({ game, size = 18, strokeWidth = 2.1, ...rest }: GameIconProps) {
  const Icon = GAME_ICONS[game];
  return <Icon size={size} strokeWidth={strokeWidth} aria-hidden {...rest} />;
}
