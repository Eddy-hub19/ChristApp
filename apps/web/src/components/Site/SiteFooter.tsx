import { getTranslations } from "next-intl/server";
import { CONTACT } from "@/content/legal";
import { Link } from "@/i18n/navigation";
import styles from "./SiteFooter.module.scss";

export default async function SiteFooter({ lang }: { lang: string }) {
  const t = await getTranslations({ locale: lang, namespace: "site" });
  const year = new Date().getFullYear();

  return (
    <footer className={styles.footer}>
      <div className={styles.inner}>
        <div className={styles.brandCol}>
          <p className={styles.brand}>Christ App</p>
          <p className={styles.tagline}>{t("footer.tagline")}</p>
        </div>

        <nav className={styles.nav} aria-label={t("footer.navLabel")}>
          <Link href="/welcome#about">{t("nav.about")}</Link>
          <Link href="/privacy">{t("nav.privacy")}</Link>
          <Link href="/terms">{t("nav.terms")}</Link>
          <Link href="/welcome#contact">{t("footer.contact")}</Link>
        </nav>
      </div>

      <p className={styles.copy}>
        © {year} Christ App. {t("footer.rights")}{" "}
        <a href={`mailto:${CONTACT}`}>{CONTACT}</a>
      </p>
    </footer>
  );
}
