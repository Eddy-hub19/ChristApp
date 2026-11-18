import Image from "next/image";
import { getTranslations } from "next-intl/server";
import styles from "./AppPreview.module.scss";

/**
 * Презентація інтерфейсу: макет на HTML/CSS із реальними ресурсами застосунку (логотип, аватар,
 * вівця з гри «Отара»). Реальних скриншотів у проєкті немає, тож макет відтворює чат, вірш і картку гри.
 */
export default async function AppPreview({ lang }: { lang: string }) {
  const t = await getTranslations({ locale: lang, namespace: "site.preview" });

  return (
    <div className={styles.stage} role="img" aria-label={t("alt")}>
      <div className={styles.glow} aria-hidden />

      <div className={styles.phone} aria-hidden>
        <div className={styles.notch} />
        <div className={styles.chatHead}>
          <Image
            src="/ava-chat.jpeg"
            alt=""
            width={36}
            height={36}
            className={styles.avatar}
          />
          <div>
            <p className={styles.chatTitle}>{t("chatTitle")}</p>
            <p className={styles.chatSub}>{t("chatOnline")}</p>
          </div>
        </div>

        <div className={styles.messages}>
          <p className={`${styles.bubble} ${styles.them}`}>{t("msg1")}</p>
          <p className={`${styles.bubble} ${styles.them}`}>{t("msg2")}</p>
          <p className={`${styles.bubble} ${styles.me}`}>{t("msg3")}</p>
        </div>

        <div className={styles.input}>
          <span>{t("inputPlaceholder")}</span>
          <span className={styles.send} />
        </div>
      </div>

      <div className={`${styles.floating} ${styles.verse}`} aria-hidden>
        <p className={styles.floatLabel}>{t("verseLabel")}</p>
        <p className={styles.verseText}>“{t("verseText")}”</p>
        <p className={styles.verseRef}>{t("verseRef")}</p>
      </div>

      <div className={`${styles.floating} ${styles.game}`} aria-hidden>
        <div className={styles.gameArt}>
          <Image
            src="/sheep.png"
            alt={t("gameAlt")}
            width={677}
            height={369}
            sizes="140px"
            className={styles.gameImg}
          />
        </div>
        <div className={styles.gameBody}>
          <p className={styles.floatLabel}>{t("gameLabel")}</p>
          <p className={styles.gameTitle}>{t("gameTitle")}</p>
          <p className={styles.gameText}>{t("gameText")}</p>
        </div>
      </div>
    </div>
  );
}
