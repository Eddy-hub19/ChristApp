"use client";

import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { Check, Copy, KeyRound } from "lucide-react";
import { issueAdminPasswordReset } from "@/lib/queries/adminQueries";
import { buildResetLink } from "@/lib/passwordReset";
import styles from "./admin.module.scss";

/** Блок «Пароль» у картці учасника: одноразова ссилка скидання (діє годину), яку адмін передає людині сам. */
export default function AdminPasswordReset({ memberId }: { memberId: string }) {
  const t = useTranslations("admin.passwordReset");
  const locale = useLocale();
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const issue = useMutation({
    mutationFn: () => issueAdminPasswordReset(memberId),
    onSuccess: ({ token }) => {
      setCopied(false);
      setLink(buildResetLink(window.location.origin, locale, token));
    },
  });

  useEffect(() => {
    if (!copied) return;
    const id = window.setTimeout(() => setCopied(false), 1500);
    return () => window.clearTimeout(id);
  }, [copied]);

  const copy = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      /* буфер недоступний - ссилку можна виділити вручну */
    }
  };

  return (
    <section className={styles.section}>
      <h3 className={styles.sectionTitle}>{t("title")}</h3>
      <div className={styles.row}>
        <button type="button" className={styles.btn} disabled={issue.isPending} onClick={() => issue.mutate()}>
          <KeyRound size={14} aria-hidden /> {issue.isPending ? t("creating") : link ? t("again") : t("create")}
        </button>
      </div>
      {issue.isError ? <p className={styles.dangerText}>{t("failed")}</p> : null}
      {link ? (
        <>
          <input
            readOnly
            value={link}
            className={styles.field}
            aria-label={t("linkLabel")}
            onFocus={(e) => e.currentTarget.select()}
          />
          <div className={styles.row}>
            <button type="button" className={styles.btnSmall} onClick={() => void copy()}>
              {copied ? <Check size={14} aria-hidden /> : <Copy size={14} aria-hidden />} {copied ? t("copied") : t("copy")}
            </button>
          </div>
          <p className={styles.hint}>{t("hint")}</p>
        </>
      ) : null}
    </section>
  );
}
