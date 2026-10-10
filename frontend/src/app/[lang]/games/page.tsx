"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import { ArrowLeft, Gamepad2 } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { useAuth } from "@/hooks/useAuth";
import { SKINS } from "@/components/FlockMiniGame/flockSkins";
import styles from "./games.module.scss";

// Арена вантажиться тільки коли гравець її відкрив (як і решта ігор).
const FlockMiniGame = dynamic(() => import("@/components/FlockMiniGame/FlockMiniGame"), { ssr: false });

export default function GamesPage() {
  const t = useTranslations("games");
  const { user } = useAuth({ redirectIfUnauthenticated: "/" });
  const [flockOpen, setFlockOpen] = useState(false);

  return (
    <section className={styles.page}>
      <header className={styles.header}>
        <Link href="/chat" className={styles.back} aria-label={t("back")} title={t("back")}>
          <ArrowLeft size={20} aria-hidden />
        </Link>
        <div>
          <h1>
            <Gamepad2 size={22} aria-hidden /> {t("title")}
          </h1>
          <p>{t("subtitle")}</p>
        </div>
      </header>

      <div className={styles.cards}>
        <button type="button" className={styles.card} onClick={() => setFlockOpen(true)} disabled={!user}>
          <span className={styles.art} aria-hidden>
            {SKINS.slice(0, 3).map((s, i) => (
              <span key={i} className={styles.blob} style={{ background: s.fur, left: `${i * 26}px`, zIndex: 3 - i }} />
            ))}
          </span>
          <span className={styles.cardBody}>
            <span className={styles.cardTitle}>{t("flock.title")}</span>
            <span className={styles.cardDesc}>{t("flock.desc")}</span>
          </span>
          <span className={styles.cta}>{t("flock.cta")}</span>
        </button>
      </div>

      {user ? <FlockMiniGame open={flockOpen} userId={user.id} onClose={() => setFlockOpen(false)} /> : null}
    </section>
  );
}
