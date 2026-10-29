"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import {
  adminFlockMuteQueryKey,
  adminFlockMutesQueryKey,
  fetchAdminFlockMute,
  setAdminFlockMute,
} from "@/lib/queries/adminQueries";
import styles from "./admin.module.scss";

const PRESETS = [5, 15, 60, 1440];

/** Блок «Отара: свій текст» у розгорнутій картці учасника: заглушити на N хвилин (пам'ять сервера) або зняти мут. */
export default function AdminFlockMute({ memberId }: { memberId: string }) {
  const t = useTranslations("admin.flockMute");
  const queryClient = useQueryClient();
  const [minutes, setMinutes] = useState("15");
  const key = adminFlockMuteQueryKey(memberId);
  const query = useQuery({ queryKey: key, queryFn: () => fetchAdminFlockMute(memberId) });
  const mutate = useMutation({
    mutationFn: (m: number) => setAdminFlockMute(memberId, m),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: key }),
        queryClient.invalidateQueries({ queryKey: adminFlockMutesQueryKey() }),
      ]);
    },
  });
  const until = query.data?.mutedUntil ?? null;
  const n = Number(minutes);
  return (
    <section className={styles.section}>
      <h3 className={styles.sectionTitle}>
        {t("title")}
        <span className={until ? styles.sectionState : styles.sectionStateOff}>
          {until ? t("mutedUntil", { time: new Date(Date.now() + Math.max(0, until - Date.now())).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) }) : t("notMuted")}
        </span>
      </h3>
      <div className={styles.pills}>
        {PRESETS.map((p) => (
          <button key={p} type="button" className={styles.pill} disabled={mutate.isPending} onClick={() => mutate.mutate(p)}>
            {p >= 60 ? t("hours", { count: p / 60 }) : t("min", { count: p })}
          </button>
        ))}
      </div>
      <div className={styles.row}>
        <input
          type="number"
          min={1}
          max={10080}
          inputMode="numeric"
          value={minutes}
          className={`${styles.field} ${styles.fieldNarrow}`}
          onChange={(e) => setMinutes(e.target.value)}
          aria-label={t("minutes")}
        />
        <button type="button" className={styles.btn} disabled={mutate.isPending || !(n >= 1)} onClick={() => mutate.mutate(Math.floor(n))}>
          {t("mute")}
        </button>
        {until ? (
          <button type="button" className={styles.btnGhost} disabled={mutate.isPending} onClick={() => mutate.mutate(0)}>
            {t("unmute")}
          </button>
        ) : null}
      </div>
    </section>
  );
}
