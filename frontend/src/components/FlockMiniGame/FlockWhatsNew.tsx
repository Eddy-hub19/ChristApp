"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import RubyIcon from "@/components/RubyIcon/RubyIcon";
import { BoltIcon, FlockIcon, LeafIcon, NameTagIcon, ScissorsIcon, ShieldIcon, StarfallIcon, EagleEyeIcon, LavaIcon, FenceIcon, AlphaIcon, SnowflakeIcon, TrophyIcon } from "@/components/icons/game";
import { WELCOME_ITEMS, type WhatsNewIcon, type WhatsNewItem, type WhatsNewLang } from "./flockWhatsNewData";
import type { Announcement } from "./flockWhatsNewLogic";
import styles from "./FlockWhatsNew.module.scss";

export const ICONS: Record<WhatsNewIcon, (p: { size: number }) => ReactNode> = {
  ruby: (p) => <RubyIcon {...p} />,
  star: (p) => (
    <svg width={p.size} height={p.size} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.3 6.1 20.5l1.2-6.5L2.5 9.4l6.6-.9z" fill="#ffc93c" stroke="#e08a00" strokeWidth="1.2" strokeLinejoin="round" />
    </svg>
  ),
  skins: (p) => <FlockIcon {...p} />,
  freeze: (p) => <SnowflakeIcon {...p} />,
  boost: (p) => <BoltIcon {...p} />,
  scissors: (p) => <ScissorsIcon {...p} />,
  names: (p) => <NameTagIcon {...p} />,
  leaf: (p) => <LeafIcon {...p} />,
  shield: (p) => <ShieldIcon {...p} />,
  trophy: (p) => <TrophyIcon {...p} />,
  starfall: (p) => <StarfallIcon {...p} />,
  eye: (p) => <EagleEyeIcon {...p} />,
  lava: (p) => <LavaIcon {...p} />,
  fence: (p) => <FenceIcon {...p} />,
  alpha: (p) => <AlphaIcon {...p} />,
};

/** Цвета игры: золото, красный, зелёный, бирюзовый, розовый. */
const COLORS = ["#ffc83d", "#e5304f", "#5fae59", "#4fc3d9", "#ff8aa0"];
const SPARKS = Array.from({ length: 18 }, (_, i) => {
  const a = (i / 18) * Math.PI * 2 + (i % 2) * 0.2;
  const r = 90 + (i % 3) * 38;
  return {
    dx: Math.round(Math.cos(a) * r),
    dy: Math.round(Math.sin(a) * r * 0.8 - 40),
    color: COLORS[i % COLORS.length],
    delay: (i % 4) * 30,
    round: i % 3 === 0,
  };
});

type Props = {
  announcement: Announcement;
  canPlay: boolean;
  /** play=true - игрок нажал «Грати». */
  onClose: (play: boolean) => void;
};

export default function FlockWhatsNew({ announcement, canPlay, onClose }: Props) {
  const t = useTranslations("flock.whatsNew");
  const locale = useLocale();
  const lang: WhatsNewLang = locale === "ru" || locale === "en" ? locale : "ua";
  const [closing, setClosing] = useState<null | boolean>(null);
  const [sparks, setSparks] = useState(true);

  useEffect(() => {
    const id = setTimeout(() => setSparks(false), 1600);
    return () => clearTimeout(id);
  }, []);

  // запасной выход, если animationend не придёт (вкладка в фоне)
  useEffect(() => {
    if (closing === null) return;
    const id = setTimeout(() => onClose(closing), 450);
    return () => clearTimeout(id);
  }, [closing, onClose]);

  const groups: { title: string | null; items: WhatsNewItem[] }[] =
    announcement.kind === "welcome"
      ? [{ title: null, items: WELCOME_ITEMS }]
      : announcement.entries.map((e, _i, all) => ({ title: all.length > 1 ? t("version", { version: e.version }) : null, items: e.items}));

  let n = 0;
  return (
    <div className={`${styles.wrap} ${closing !== null ? styles.wrapOut : ""}`} data-testid="flock-whats-new">
      <div
        className={`${styles.card} ${closing !== null ? styles.cardOut : ""}`}
        role="dialog"
        aria-label={announcement.kind === "welcome" ? t("welcomeTitle") : t("title")}
        onAnimationEnd={(e) => {
          if (closing !== null && e.target === e.currentTarget) onClose(closing);
        }}
      >
        {sparks ? (
          <div className={styles.sparks} aria-hidden>
            {SPARKS.map((s, i) => (
              <span
                key={i}
                className={`${styles.spark} ${s.round ? styles.sparkRound : ""}`}
                style={{ "--dx": `${s.dx}px`, "--dy": `${s.dy}px`, background: s.color, animationDelay: `${160 + s.delay}ms` } as React.CSSProperties}
              />
            ))}
          </div>
        ) : null}
        <h2 className={styles.title}>{announcement.kind === "welcome" ? t("welcomeTitle") : t("title")}</h2>
        {groups.map((g, gi) => (
          <div key={gi}>
            {g.title ? <h3 className={styles.version}>{g.title}</h3> : null}
            <ul className={styles.list}>
              {g.items.map((item) => {
                const idx = n++;
                return (
                  <li key={idx} className={styles.item} style={{ animationDelay: `${260 + idx * 90}ms` }}>
                    <span className={styles.icon} style={{ animationDelay: `${420 + idx * 90}ms` }}>
                      {ICONS[item.icon]({ size: 30 })}
                    </span>
                    <span className={styles.text}>{item.text[lang]}</span>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
        <div className={styles.buttons}>
          <button type="button" className={styles.primary} disabled={!canPlay} onClick={() => setClosing(true)}>
            {t("play")}
          </button>
          <button type="button" className={styles.secondary} onClick={() => setClosing(false)} autoFocus>
            {t("ok")}
          </button>
        </div>
      </div>
    </div>
  );
}
