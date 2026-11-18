import { getTranslations } from "next-intl/server";
import type { LegalDocument } from "@/content/legal";
import { Link } from "@/i18n/navigation";
import styles from "./LegalPage.module.scss";

/** Сторінка юридичного документа (Privacy Policy / Terms) у публічній оболонці `(site)`. */
export default async function LegalPage({
  doc,
  lang,
}: {
  doc: LegalDocument;
  lang: string;
}) {
  const t = await getTranslations({ locale: lang, namespace: "site.legal" });

  return (
    <div className={styles.wrap}>
      <article className={styles.card}>
        <Link href="/welcome" className={styles.back}>
          ← {t("back")}
        </Link>
        <h1 className={styles.title}>{doc.title}</h1>
        <p className={styles.date}>
          <strong>{t("effective")}:</strong> {doc.effectiveDate}
          {" · "}
          <strong>{t("updated")}:</strong> {doc.lastUpdated}
        </p>
        {lang !== "en" ? (
          <p className={styles.notice}>
            {t("englishOnly")}
          </p>
        ) : null}
        <div lang="en">
          <p className={styles.text}>{doc.intro}</p>
          {doc.sections.map((section) => (
            <section key={section.heading}>
              <h2 className={styles.heading}>{section.heading}</h2>
              {section.blocks.map((block, i) =>
                block.type === "p" ? (
                  <p key={i} className={styles.text}>
                    {block.content}
                  </p>
                ) : (
                  <ul key={i} className={styles.list}>
                    {block.items.map((item, j) => (
                      <li key={j}>{item}</li>
                    ))}
                  </ul>
                ),
              )}
            </section>
          ))}
        </div>
      </article>
    </div>
  );
}
