import Image from "next/image";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import SiteLangSwitch from "./SiteLangSwitch";
import styles from "./SiteHeader.module.scss";

/**
 * Шапка публічних сторінок. Серверний компонент: мобільне меню — на `<details>`,
 * тож усе працює без клієнтського JavaScript.
 */
export default async function SiteHeader({ lang }: { lang: string }) {
  const t = await getTranslations({ locale: lang, namespace: "site.nav" });

  const links = (
    <>
      <Link href="/welcome#features">{t("features")}</Link>
      <Link href="/welcome#about">{t("about")}</Link>
      <Link href="/privacy">{t("privacy")}</Link>
      <Link href="/terms">{t("terms")}</Link>
    </>
  );

  return (
    <header className={styles.header}>
      <div className={styles.inner}>
        <Link href="/welcome" className={styles.brand} aria-label={t("home")}>
          <Image
            src="/icon-192x192.png"
            alt=""
            width={32}
            height={32}
            className={styles.logo}
            priority
          />
          <span>Christ App</span>
        </Link>

        <nav className={styles.nav} aria-label={t("label")}>
          {links}
        </nav>

        <div className={styles.actions}>
          <SiteLangSwitch label={t("language")} />
          <Link href="/" className={styles.signIn}>
            {t("signIn")}
          </Link>
          <details className={styles.menu}>
            <summary className={styles.menuButton} aria-label={t("menu")}>
              <span aria-hidden className={styles.burger} />
            </summary>
            <nav className={styles.menuPanel} aria-label={t("label")}>
              {links}
            </nav>
          </details>
        </div>
      </div>
    </header>
  );
}
