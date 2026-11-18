"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import {
  AdminHttpError,
  adminBroadcastQueryKey,
  fetchAdminBroadcastRecipients,
  sendAdminBroadcast,
  type AdminBroadcastResult,
} from "@/lib/queries/adminQueries";
import styles from "./admin.module.scss";

const TITLE_MAX = 80;
const BODY_MAX = 300;

/** Вкладка «Push»: отправить уведомление всем, у кого включены пуши. Перед отправкой — подтверждение с числом получателей. */
export default function AdminBroadcast() {
  const t = useTranslations("admin.broadcast");
  const queryClient = useQueryClient();
  const [title, setTitle] = useState(t("defaultTitle"));
  const [body, setBody] = useState(t("defaultBody"));
  const [url, setUrl] = useState("/chat");
  const [result, setResult] = useState<AdminBroadcastResult | null>(null);

  const recipients = useQuery({
    queryKey: adminBroadcastQueryKey(),
    queryFn: fetchAdminBroadcastRecipients,
  });

  const send = useMutation({
    mutationFn: () => sendAdminBroadcast({ title: title.trim(), body: body.trim(), url: url.trim() || undefined }),
    onSuccess: (data) => {
      setResult(data);
      void queryClient.invalidateQueries({ queryKey: adminBroadcastQueryKey() });
    },
  });

  const data = recipients.data;
  const valid = title.trim().length > 0 && body.trim().length > 0 && (url.trim() === "" || url.trim().startsWith("/"));
  const canSend = valid && !!data?.enabled && data.devices > 0 && !send.isPending;

  const onSend = () => {
    if (!data) return;
    if (!window.confirm(t("confirm", { devices: data.devices, users: data.users }))) return;
    setResult(null);
    send.mutate();
  };

  const errorText = send.error
    ? send.error instanceof AdminHttpError && send.error.status === 429
      ? t("errorCooldown")
      : t("errorGeneric")
    : null;

  return (
    <div className={styles.usersPanel}>
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>{t("title")}</h3>
        <p className={styles.meta}>{t("hint")}</p>

        <p className={styles.meta} role="status">
          {recipients.isLoading
            ? t("loading")
            : recipients.error
              ? t("recipientsFailed")
              : !data?.enabled
                ? t("notConfigured")
                : t("recipients", { devices: data.devices, users: data.users })}
        </p>

        <label className={styles.section}>
          <span className={styles.sectionState}>{t("labelTitle")}</span>
          <input
            className={styles.field}
            value={title}
            maxLength={TITLE_MAX}
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>
        <label className={styles.section}>
          <span className={styles.sectionState}>{t("labelBody")}</span>
          <textarea
            className={styles.field}
            style={{ padding: "10px 12px", minHeight: 96, resize: "vertical" }}
            value={body}
            maxLength={BODY_MAX}
            onChange={(e) => setBody(e.target.value)}
          />
          <span className={styles.sectionStateOff}>
            {body.length}/{BODY_MAX}
          </span>
        </label>
        <label className={styles.section}>
          <span className={styles.sectionState}>{t("labelUrl")}</span>
          <input
            className={styles.field}
            value={url}
            maxLength={200}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="/chat"
            autoCapitalize="off"
            spellCheck={false}
          />
        </label>

        <div className={styles.row}>
          <button type="button" className={styles.btn} disabled={!canSend} onClick={onSend}>
            {send.isPending ? t("sending") : t("send")}
          </button>
        </div>

        {errorText ? <p className={styles.error}>{errorText}</p> : null}
        {result ? (
          <p className={styles.meta} role="status">
            {t("result", {
              sent: result.sent,
              devices: result.devices,
              removed: result.removed,
              failed: result.failed,
            })}
          </p>
        ) : null}
      </section>
    </div>
  );
}
