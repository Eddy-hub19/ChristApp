import {
  BookOpen,
  Gamepad2,
  MessagesSquare,
  NotebookPen,
  UserRound,
  Users,
} from "lucide-react";
import { getTranslations } from "next-intl/server";
import { CONTACT } from "@/content/legal";
import { Link } from "@/i18n/navigation";
import AppPreview from "./AppPreview";
import styles from "./Landing.module.scss";

const FEATURES = [
  { key: "community", Icon: Users },
  { key: "bible", Icon: BookOpen },
  { key: "chat", Icon: MessagesSquare },
  { key: "notes", Icon: NotebookPen },
  { key: "games", Icon: Gamepad2 },
  { key: "profiles", Icon: UserRound },
] as const;

const PILLARS = ["faith", "scripture", "community"] as const;

/** Лендинг Christ App: чистий серверний компонент, весь контент є в HTML без JS і без сесії. */
export default async function Landing({ lang }: { lang: string }) {
  const t = await getTranslations({ locale: lang, namespace: "site" });

  return (
    <>
      <section className={styles.hero} aria-labelledby="hero-title">
        <div className={styles.heroCopy}>
          <p className={`${styles.eyebrow} ${styles.rise}`}>{t("hero.eyebrow")}</p>
          <h1 id="hero-title" className={`${styles.heroTitle} ${styles.rise}`}>
            {t("hero.title")}
          </h1>
          <p className={`${styles.heroSub} ${styles.rise}`}>{t("hero.subtitle")}</p>
          <div className={`${styles.cta} ${styles.rise}`}>
            <Link href="/welcome#features" className={styles.primary}>
              {t("hero.exploreFeatures")}
            </Link>
            <Link href="/" className={styles.secondary}>
              {t("hero.signIn")}
            </Link>
          </div>
          <p className={`${styles.hint} ${styles.rise}`}>{t("hero.hint")}</p>
        </div>
        <AppPreview lang={lang} />
      </section>

      <section
        id="features"
        className={styles.section}
        aria-labelledby="features-title"
      >
        <header className={`${styles.sectionHead} ${styles.reveal}`}>
          <p className={styles.eyebrow}>{t("features.eyebrow")}</p>
          <h2 id="features-title" className={styles.h2}>
            {t("features.title")}
          </h2>
          <p className={styles.lead}>{t("features.intro")}</p>
        </header>

        <ul className={styles.grid}>
          {FEATURES.map(({ key, Icon }) => (
            <li key={key} className={`${styles.card} ${styles.reveal}`}>
              <span className={styles.icon} aria-hidden>
                <Icon size={22} strokeWidth={1.75} />
              </span>
              <h3 className={styles.h3}>{t(`features.items.${key}.title`)}</h3>
              <p className={styles.cardText}>{t(`features.items.${key}.text`)}</p>
            </li>
          ))}
        </ul>
      </section>

      <section id="about" className={styles.section} aria-labelledby="about-title">
        <div className={`${styles.about} ${styles.reveal}`}>
          <div>
            <p className={styles.eyebrow}>{t("about.eyebrow")}</p>
            <h2 id="about-title" className={styles.h2}>
              {t("about.title")}
            </h2>
            <p className={styles.lead}>{t("about.lead")}</p>
          </div>
          <div className={styles.prose}>
            <p>{t("about.p1")}</p>
            <p>{t("about.p2")}</p>
            <p>{t("about.p3")}</p>
          </div>
        </div>

        <ul className={styles.pillars}>
          {PILLARS.map((key) => (
            <li key={key} className={`${styles.pillar} ${styles.reveal}`}>
              <h3 className={styles.h3}>{t(`about.pillars.${key}.title`)}</h3>
              <p className={styles.cardText}>{t(`about.pillars.${key}.text`)}</p>
            </li>
          ))}
        </ul>
      </section>

      <section
        id="privacy"
        className={styles.section}
        aria-labelledby="privacy-title"
      >
        <div className={`${styles.transparency} ${styles.reveal}`}>
          <p className={styles.eyebrow}>{t("transparency.eyebrow")}</p>
          <h2 id="privacy-title" className={styles.h2}>
            {t("transparency.title")}
          </h2>

          <div className={styles.tcols}>
            <div>
              <h3 className={styles.h3}>{t("transparency.googleTitle")}</h3>
              <p className={styles.cardText}>{t("transparency.googleText")}</p>
            </div>
            <div>
              <h3 className={styles.h3}>{t("transparency.policyTitle")}</h3>
              <p className={styles.cardText}>{t("transparency.policyText")}</p>
            </div>
          </div>

          <div className={styles.cta}>
            <Link href="/privacy" className={styles.primary}>
              {t("transparency.readPolicy")}
            </Link>
            <Link href="/terms" className={styles.secondary}>
              {t("transparency.readTerms")}
            </Link>
          </div>
        </div>
      </section>

      <section
        id="contact"
        className={styles.section}
        aria-labelledby="contact-title"
      >
        <div className={`${styles.contact} ${styles.reveal}`}>
          <h2 id="contact-title" className={styles.h3}>
            {t("contact.title")}
          </h2>
          <p className={styles.cardText}>
            {t("contact.text")}{" "}
            <a href={`mailto:${CONTACT}`}>{CONTACT}</a>
          </p>
        </div>
      </section>
    </>
  );
}
