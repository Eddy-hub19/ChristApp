import { ColorIconSvg, INK, useGradient, type ColorIconProps } from "./GameIconBase";

/*
 * Власний набір кольорових іконок ігор: 24×24, пласка двотонова заливка, м'який блік,
 * тонкий темний контур (читається і на темному, і на світлому фоні). Кольори не залежать
 * від currentColor. У кожної гри свій основний колір; акцент — золото застосунку.
 */

const GOLD = "#ffc83d";
const GOLD_DEEP = "#f0a21c";
const SW = 1.15;

const stroke = { stroke: INK, strokeWidth: SW, strokeLinejoin: "round", strokeLinecap: "round" } as const;

export function DoodleIcon(props: ColorIconProps) {
  const body = useGradient("#b4ec5c", "#6cc22b");
  return (
    <ColorIconSvg {...props}>
      <defs>{body.def}</defs>
      <path d="M8 16.8l8 1.2-8 1.2 8 1.2-8 1.2" {...stroke} strokeWidth={3.6} />
      <path d="M8 16.8l8 1.2-8 1.2 8 1.2-8 1.2" stroke={GOLD} strokeWidth={1.8} strokeLinejoin="round" strokeLinecap="round" />
      <rect x="5.2" y="2.4" width="11.6" height="14" rx="5.2" fill={body.fill} {...stroke} />
      <rect x="14.4" y="8.6" width="6.4" height="3.4" rx="1.7" fill="#5aa91f" {...stroke} />
      <circle cx="9.7" cy="7.6" r="1.9" fill="#fff" {...stroke} strokeWidth={0.9} />
      <circle cx="13.7" cy="7.6" r="1.9" fill="#fff" {...stroke} strokeWidth={0.9} />
      <circle cx="10.3" cy="7.8" r="0.8" fill={INK} />
      <circle cx="14.3" cy="7.8" r="0.8" fill={INK} />
      <path d="M7.4 5.2c.9-1 2.2-1.4 3.4-1.2" stroke="#fff" strokeOpacity=".65" strokeWidth="1.3" strokeLinecap="round" />
    </ColorIconSvg>
  );
}

export function SnakeIcon(props: ColorIconProps) {
  const head = useGradient("#55e3d2", "#14a899");
  const path = "M5.6 19c-1.6-4.6 3.2-5.2 6.4-5.8 3.4-.7 3.6-2.6 3.2-4.4";
  return (
    <ColorIconSvg {...props}>
      <defs>{head.def}</defs>
      <path d={path} stroke={INK} strokeWidth="7" strokeLinecap="round" />
      <path d={path} stroke="#19b9a8" strokeWidth="5.4" strokeLinecap="round" />
      <path d="M5.4 17.2c.4-1.2 1.6-1.9 3-2.2" stroke="#9df3e8" strokeOpacity=".75" strokeWidth="1.3" strokeLinecap="round" />
      <circle cx="15.4" cy="7.6" r="4.7" fill={head.fill} {...stroke} />
      <circle cx="13.4" cy="6.6" r="1.9" fill="#fff" {...stroke} strokeWidth={0.8} />
      <circle cx="17.4" cy="6.6" r="1.9" fill="#fff" {...stroke} strokeWidth={0.8} />
      <circle cx="13.8" cy="6.9" r="0.95" fill={INK} />
      <circle cx="17.0" cy="6.9" r="0.95" fill={INK} />
      <path d="M13.8 9.8c.9.6 2.1.6 3 0" stroke={INK} strokeWidth="1" strokeLinecap="round" />
      <path d="M12.4 4.4c.9-.8 2-1 3-.8" stroke="#fff" strokeOpacity=".7" strokeWidth="1.1" strokeLinecap="round" />
      <path d="M20 9.6l1.7 1M20 9.6l1.5-1.1" stroke="#ff4d6d" strokeWidth="1.1" strokeLinecap="round" />
    </ColorIconSvg>
  );
}

export function FilwordIcon(props: ColorIconProps) {
  const card = useGradient("#74b7ff", "#3a7de0");
  const tile = (x: number, y: number, gold: boolean) => (
    <rect x={x} y={y} width="7.6" height="7.6" rx="2" fill={gold ? GOLD : "#fff"} stroke={INK} strokeWidth="0.9" />
  );
  const letter = { strokeWidth: 1.5, strokeLinecap: "round", strokeLinejoin: "round" } as const;
  return (
    <ColorIconSvg {...props}>
      <defs>{card.def}</defs>
      <rect x="1.8" y="1.8" width="20.4" height="20.4" rx="5.4" fill={card.fill} {...stroke} />
      {tile(3.9, 3.9, false)}
      {tile(12.5, 3.9, false)}
      {tile(3.9, 12.5, true)}
      {tile(12.5, 12.5, true)}
      <path d="M5.9 10.4l2-4.8 2 4.8M6.6 8.9h2.6" stroke="#2f6fd0" {...letter} />
      <path d="M14.6 5.6v4.8M14.6 5.6h1.5a1.3 1.3 0 010 2.4h-1.5m0 0h1.7a1.3 1.3 0 010 2.4h-1.7" stroke="#2f6fd0" {...letter} />
      <path d="M10.2 14.6A2.5 2.5 0 108.4 18a2.5 2.5 0 001.8-.8" stroke={INK} {...letter} transform="translate(0 0)" />
      <path d="M14.6 14.3v4.6h1.1a2.3 2.3 0 000-4.6z" stroke={INK} {...letter} />
      <path d="M4 5.2c.7-1.5 2.2-2 3.6-1.9" stroke="#fff" strokeOpacity=".55" strokeWidth="1.2" strokeLinecap="round" />
    </ColorIconSvg>
  );
}

export function GuessIcon(props: ColorIconProps) {
  const sil = useGradient("#b79cff", "#7a55e6");
  return (
    <ColorIconSvg {...props}>
      <defs>{sil.def}</defs>
      <circle cx="9.6" cy="7.6" r="4.2" fill={sil.fill} {...stroke} />
      <path d="M2.6 20.4c0-4.6 3-6.6 7-6.6 1.2 0 2.3.2 3.2.5l-.6 6.1z" fill={sil.fill} {...stroke} />
      <path d="M7.3 5.4c.7-.9 1.8-1.3 2.8-1.1" stroke="#fff" strokeOpacity=".6" strokeWidth="1.2" strokeLinecap="round" />
      <path d="M17 17l4 4" stroke={INK} strokeWidth="4" strokeLinecap="round" />
      <path d="M17 17l4 4" stroke={GOLD_DEEP} strokeWidth="2.4" strokeLinecap="round" />
      <circle cx="15.2" cy="14.6" r="5.2" fill="#fff" stroke={INK} strokeWidth="2.9" />
      <circle cx="15.2" cy="14.6" r="5.2" fill="#e9f6ff" stroke={GOLD} strokeWidth="1.7" />
      <path d="M13.5 13.4a1.8 1.8 0 113 .9c-.5.6-1.3.8-1.3 1.6" stroke={INK} strokeWidth="1.1" strokeLinecap="round" />
      <circle cx="15.2" cy="17.1" r=".6" fill={INK} />
    </ColorIconSvg>
  );
}

export function PuzzleIcon(props: ColorIconProps) {
  const piece = useGradient("#ffb066", "#ff7a1f");
  return (
    <ColorIconSvg {...props}>
      <defs>{piece.def}</defs>
      <path
        d="M3.5 7.2h5.4c-.9-2.2-.1-4.2 2.1-4.2s3 2 2.1 4.2h5.4v4c2.2-.9 4.2-.1 4.2 2.1s-2 3-4.2 2.1V20.5H3.5v-5.1c2 .8 3.6-.1 3.6-1.9s-1.6-2.7-3.6-1.9z"
        fill={piece.fill}
        {...stroke}
      />
      <path d="M5.2 8.9v3M8.8 5.3c.4-.8 1.2-1.2 2-1.1" stroke="#fff" strokeOpacity=".6" strokeWidth="1.3" strokeLinecap="round" />
      <circle cx="15.5" cy="17.2" r="1.4" fill={GOLD} stroke={INK} strokeWidth="0.8" />
    </ColorIconSvg>
  );
}

export function FlockIcon(props: ColorIconProps) {
  const wool = useGradient("#ffffff", "#efdcb8");
  const face = useGradient("#8d7898", "#54445e");
  const circles = [
    [6.6, 12, 3.6],
    [10, 9.3, 3.7],
    [11.4, 13.4, 3.5],
    [6.6, 15.4, 2.9],
  ] as const;
  return (
    <ColorIconSvg {...props}>
      <defs>{wool.def}{face.def}</defs>
      <path d="M7.4 16.5v4.2M11.6 16.5v4.2" stroke={INK} strokeWidth="3.2" strokeLinecap="round" />
      <path d="M7.4 16.5v4.2M11.6 16.5v4.2" stroke="#6b5a76" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M14.6 9.2L11.9 7.4c-.9 1.4-.2 3 1.2 3.6z" fill="#54445e" {...stroke} strokeWidth="0.9" />
      <path d="M20.6 9.2l2.4-1.4c.7 1.3 0 2.9-1.4 3.4z" fill="#54445e" {...stroke} strokeWidth="0.9" />
      <g fill="none" stroke={INK} strokeWidth={SW * 2}>
        {circles.map(([cx, cy, r]) => (
          <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={r} />
        ))}
      </g>
      <g fill={wool.fill}>
        {circles.map(([cx, cy, r]) => (
          <circle key={`f-${cx}-${cy}`} cx={cx} cy={cy} r={r} />
        ))}
      </g>
      <ellipse cx="17.7" cy="12.6" rx="4.5" ry="5.4" fill={face.fill} {...stroke} />
      <circle cx="15.9" cy="11" r="1.7" fill="#fff" />
      <circle cx="19.6" cy="11" r="1.7" fill="#fff" />
      <circle cx="16.2" cy="11.2" r="0.9" fill={INK} />
      <circle cx="19.3" cy="11.2" r="0.9" fill={INK} />
      <ellipse cx="17.7" cy="15.4" rx="2.2" ry="1.5" fill="#ffc2cb" stroke={INK} strokeWidth="0.7" />
      <path d="M4.2 10.4c.5-1.3 1.6-2 2.9-2" stroke="#fff" strokeWidth="1.1" strokeLinecap="round" />
    </ColorIconSvg>
  );
}

export function MegaphoneIcon(props: ColorIconProps) {
  const horn = useGradient("#ff8aa0", "#f2456a");
  return (
    <ColorIconSvg {...props}>
      <defs>{horn.def}</defs>
      <path d="M7.4 15l1.1 4.8c.1.5.5.8 1 .8h1.8c.7 0 1.1-.6.9-1.2L10.8 15z" fill={GOLD} {...stroke} />
      <path d="M3.4 9.2h3.9l7.6-4.4a.9.9 0 011.4.8v12.8a.9.9 0 01-1.4.8L7.3 14.8H3.4a1.4 1.4 0 01-1.4-1.4v-2.8a1.4 1.4 0 011.4-1.4z" fill={horn.fill} {...stroke} />
      <rect x="14.6" y="4" width="3" height="16" rx="1.5" fill={GOLD} {...stroke} />
      <path d="M4 10.6h3M8.8 9.6l4-2.4" stroke="#fff" strokeOpacity=".65" strokeWidth="1.2" strokeLinecap="round" />
      <path d="M20.2 8.8c1.1 1.7 1.1 4.7 0 6.4" stroke={GOLD_DEEP} strokeWidth="1.5" strokeLinecap="round" />
    </ColorIconSvg>
  );
}

/** Рубін — для майбутньої валюти «Рубіни» в «Отарі». Поряд із текстом — size 16–20. */
export function RubyIcon(props: ColorIconProps) {
  return (
    <ColorIconSvg {...props}>
      <path d="M3 9.6L7 4h10l4 5.6-9 11.4z" fill="#e5304f" />
      <path d="M3 9.6L7 4l2.6 5.6z" fill="#ff6b84" />
      <path d="M7 4h10l-2.6 5.6H9.6z" fill="#ff8da0" />
      <path d="M17 4l4 5.6h-6.6z" fill="#d11f44" />
      <path d="M3 9.6h6.6L12 21z" fill="#c9193f" />
      <path d="M9.6 9.6h4.8L12 21z" fill="#e5304f" />
      <path d="M14.4 9.6H21L12 21z" fill="#a3122f" />
      <path d="M3 9.6L7 4h10l4 5.6-9 11.4zM3 9.6h18M9.6 9.6L7 4M14.4 9.6L17 4M9.6 9.6L12 21M14.4 9.6L12 21" {...stroke} strokeWidth="1.1" />
      <path d="M8.6 6.2l1.2-1M5.6 9l.9-1.4" stroke="#fff" strokeOpacity=".85" strokeWidth="1.2" strokeLinecap="round" />
    </ColorIconSvg>
  );
}

/* Іконки для плашки «Що нового» / «Ласкаво просимо» в «Отарі». */

export function SnowflakeIcon(props: ColorIconProps) {
  const g = useGradient("#bfeaff", "#5bb8f0");
  return (
    <ColorIconSvg {...props}>
      <defs>{g.def}</defs>
      <circle cx="12" cy="12" r="10" fill={g.fill} {...stroke} />
      <path d="M12 5v14M5.9 8.5l12.2 7M18.1 8.5l-12.2 7" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M10 5.8l2 1.6 2-1.6M10 18.2l2-1.6 2 1.6" stroke="#fff" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </ColorIconSvg>
  );
}

export function BoltIcon(props: ColorIconProps) {
  const g = useGradient("#ffe27a", "#ffab1a");
  return (
    <ColorIconSvg {...props}>
      <defs>{g.def}</defs>
      <path d="M13.6 2L4.5 13.4h6L9.4 22l10.1-12.2h-6.3z" fill={g.fill} {...stroke} />
      <path d="M12.6 5.4L8 11.2" stroke="#fff" strokeOpacity=".75" strokeWidth="1.2" strokeLinecap="round" />
    </ColorIconSvg>
  );
}

export function NameTagIcon(props: ColorIconProps) {
  const g = useGradient("#9be3a0", "#4fb862");
  return (
    <ColorIconSvg {...props}>
      <defs>{g.def}</defs>
      <rect x="2.5" y="5" width="19" height="14" rx="3.5" fill={g.fill} {...stroke} />
      <circle cx="8.3" cy="10.6" r="2.1" fill="#fff" {...stroke} strokeWidth="0.9" />
      <path d="M4.9 16c.5-1.8 1.9-2.7 3.4-2.7s2.9.9 3.4 2.7z" fill="#fff" />
      <path d="M14 10h5M14 13.4h3.4" stroke="#fff" strokeWidth="1.7" strokeLinecap="round" />
    </ColorIconSvg>
  );
}

export function LeafIcon(props: ColorIconProps) {
  const g = useGradient("#a5e58a", "#4aa84a");
  return (
    <ColorIconSvg {...props}>
      <defs>{g.def}</defs>
      <path d="M20.5 3.5C11 3 4.5 8 4.5 14.5c0 1.6.4 3 1.2 4.2C7 19.5 8.8 20 10.5 20c6.5 0 10.5-6.5 10-16.5z" fill={g.fill} {...stroke} />
      <path d="M4.5 20.5C8 15 12 11.5 16.5 9" stroke="#fff" strokeOpacity=".8" strokeWidth="1.4" strokeLinecap="round" />
    </ColorIconSvg>
  );
}

export function ShieldIcon(props: ColorIconProps) {
  const g = useGradient("#ff8aa0", "#e23c5e");
  return (
    <ColorIconSvg {...props}>
      <defs>{g.def}</defs>
      <path d="M12 2.5l8 3v6c0 5-3.3 8.6-8 10-4.7-1.4-8-5-8-10v-6z" fill={g.fill} {...stroke} />
      <path d="M12 6v12.4M7.2 9.2L12 11l4.8-1.8" stroke="#fff" strokeOpacity=".8" strokeWidth="1.3" strokeLinecap="round" />
    </ColorIconSvg>
  );
}

export function TrophyIcon(props: ColorIconProps) {
  const g = useGradient("#ffe27a", "#f0a21c");
  return (
    <ColorIconSvg {...props}>
      <defs>{g.def}</defs>
      <path d="M7 4h10v5.5a5 5 0 01-10 0z" fill={g.fill} {...stroke} />
      <path d="M7 6H3.8c0 3 1.3 4.6 3.6 4.9M17 6h3.2c0 3-1.3 4.6-3.6 4.9" fill="none" {...stroke} />
      <path d="M12 14.5V18M8.5 20.5h7M9.5 18h5v2.5h-5z" fill={GOLD_DEEP} {...stroke} />
      <path d="M9.4 6.2v3" stroke="#fff" strokeOpacity=".8" strokeWidth="1.3" strokeLinecap="round" />
    </ColorIconSvg>
  );
}
