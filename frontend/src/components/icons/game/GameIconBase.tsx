import { useId, type ReactNode, type SVGProps } from "react";

export type ColorIconProps = Omit<SVGProps<SVGSVGElement>, "children"> & {
  size?: number;
  /** Приглушений вигляд для неактивного стану (колір зберігається, але бліднішає). */
  muted?: boolean;
};

export const INK = "#2d2438";

/** Градієнт «світліший зверху → насичений знизу»; id унікальний, щоб кілька іконок на сторінці не конфліктували. */
export function useGradient(from: string, to: string) {
  const id = useId().replace(/:/g, "");
  const def = (
    <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stopColor={from} />
      <stop offset="1" stopColor={to} />
    </linearGradient>
  );
  return { fill: `url(#${id})`, def };
}

export function ColorIconSvg({
  size = 24,
  muted = false,
  style,
  children,
  ...rest
}: ColorIconProps & { children: ReactNode }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      focusable="false"
      style={muted ? { filter: "grayscale(0.85)", opacity: 0.6, ...style } : style}
      {...rest}
    >
      {children}
    </svg>
  );
}
