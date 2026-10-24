"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { adminFlockMuteQueryKey, fetchAdminFlockMute, setAdminFlockMute } from "@/lib/queries/adminQueries";
import styles from "./admin.module.scss";

const PRESETS = [5, 15, 60, 1440];

/** Блок «Отара: свій текст» у картці учасника: заглушити на N хвилин (пам'ять сервера) або зняти мут. */
export default function AdminFlockMute({ memberId }: { memberId: string }) {
  const t = useTranslations("admin.flockMute");
  const queryClient = useQueryClient();
  const [minutes, setMinutes] = useState("15");
  const key = adminFlockMuteQueryKey(memberId);
  const query = useQuery({ queryKey: key, queryFn: () => fetchAdminFlockMute(memberId) });
  const mutate = useMutation({
    mutationFn: (m: number) => setAdminFlockMute(memberId, m),
    onSuccess: async () => queryClient.invalidateQueries({ queryKey: key }),
  });
  const until = query.data?.mutedUntil ?? null;
  const n = Number(minutes);
  return (
    <div className={styles.rubies}>
      <p className={styles.meta}>
        <strong>{t("title")}</strong>{" "}
        {until ? t("mutedUntil", { time: new Date(Date.now() + Math.max(0, until - Date.now())).toLocaleTimeString() }) : t("notMuted")}
      </p>
      <div className={styles.actions}>
        <input
          type="number"
          min={1}
          max={10080}
          value={minutes}
          onChange={(e) => setMinutes(e.target.value)}
          aria-label={t("minutes")}
          style={{ width: 80 }}
        />
        <button type="button" disabled={mutate.isPending || !(n >= 1)} onClick={() => mutate.mutate(Math.floor(n))}>
          {t("mute")}
        </button>
        {PRESETS.map((p) => (
          <button key={p} type="button" disabled={mutate.isPending} onClick={() => mutate.mutate(p)}>
            {p >= 60 ? t("hours", { count: p / 60 }) : t("min", { count: p })}
          </button>
        ))}
        {until ? (
          <button type="button" disabled={mutate.isPending} onClick={() => mutate.mutate(0)}>
            {t("unmute")}
          </button>
        ) : null}
      </div>
    </div>
  );
}
