import { Link } from "@/i18n/navigation";
import type { LegalDocument } from "@/content/legal";
import styles from "./LegalPage.module.scss";

export default function LegalPage({
  doc,
  backLabel,
}: {
  doc: LegalDocument;
  backLabel: string;
}) {
  return (
    <div className={styles.wrap}>
      <article className={styles.card}>
        <Link href="/" className={styles.back}>
          ← {backLabel}
        </Link>
        <h1 className={styles.title}>{doc.title}</h1>
        <p className={styles.date}>
          <strong>Effective date</strong> — {doc.effectiveDate}
        </p>
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
      </article>
    </div>
  );
}
