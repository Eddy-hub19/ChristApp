import { useId } from "react";
import { GiCutDiamond } from "react-icons/gi";

type Props = {
  size?: number | string;
  className?: string;
  title?: string;
};

/**
 * Єдине джерело іконки рубіна для всього застосунку: баланс, ціни скінів, анімація «+10», адмінка.
 * Замінити вигляд (наприклад, на кольорову іконку з окремої гілки) - лише змінивши цей файл.
 * Градієнт: два відтінки червоного + блік, задається через fill іконки Game Icons (Lorc, CC BY 3.0).
 */
export default function RubyIcon({ size = "1em", className, title }: Props) {
  const gid = useId().replace(/[^a-zA-Z0-9]/g, "");
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 512 512"
      className={className}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      style={{ flexShrink: 0, verticalAlign: "-0.125em" }}
    >
      <defs>
        <linearGradient id={`${gid}-g`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ff7a8a" />
          <stop offset="0.55" stopColor="#e0112b" />
          <stop offset="1" stopColor="#8f0a1d" />
        </linearGradient>
      </defs>
      <GiCutDiamond size={512} style={{ fill: `url(#${gid}-g)` }} />
    </svg>
  );
}
