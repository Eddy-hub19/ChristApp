import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import styles from "@/components/Movies/Movies.module.scss";

export default async function MovieNotFound() {
  const t = await getTranslations("movies");
  return (
    <div className={styles.page}>
      <p className={styles.hint}>{t("notFound")}</p>
      <Link href="/movie" className={styles.backLink}>
        ← {t("backToSearch")}
      </Link>
    </div>
  );
}
