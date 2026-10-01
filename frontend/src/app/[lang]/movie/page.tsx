import { getTranslations } from "next-intl/server";
import { Film } from "lucide-react";
import MovieSearch from "@/components/Movies/MovieSearch";
import styles from "@/components/Movies/Movies.module.scss";

export default async function MoviesPage() {
  const t = await getTranslations("movies");
  return (
    <section className={styles.page}>
      <header className={styles.pageHeader}>
        <span className={styles.pageIcon} aria-hidden>
          <Film size={22} />
        </span>
        <h1 className={styles.pageTitle}>{t("title")}</h1>
      </header>
      <MovieSearch />
    </section>
  );
}
