"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import {
  adminPuzzleBlocksQueryKey,
  adminPuzzleImagesQueryKey,
  deleteAdminPuzzleImage,
  fetchAdminPuzzleBlocks,
  fetchAdminPuzzleImages,
  setAdminPuzzleBlock,
} from "@/lib/queries/adminQueries";
import styles from "./admin.module.scss";

/** Раздел «Пазли»: все загруженные пользователями картинки и блокировка загрузки. Права проверяет сервер (AdminGuard). */
export default function AdminPuzzleImages() {
  const t = useTranslations("admin.puzzleImages");
  const queryClient = useQueryClient();
  const images = useQuery({ queryKey: adminPuzzleImagesQueryKey(), queryFn: fetchAdminPuzzleImages });
  const blocks = useQuery({ queryKey: adminPuzzleBlocksQueryKey(), queryFn: fetchAdminPuzzleBlocks });
  const remove = useMutation({
    mutationFn: deleteAdminPuzzleImage,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: adminPuzzleImagesQueryKey() }),
  });
  const block = useMutation({
    mutationFn: ({ userId, blocked }: { userId: string; blocked: boolean }) => setAdminPuzzleBlock(userId, blocked),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: adminPuzzleBlocksQueryKey() }),
  });
  const blockedIds = new Set((blocks.data ?? []).map((b) => b.userId));
  const name = (o: { username: string; nickname: string | null }) => o.nickname?.trim() || o.username;

  return (
    <div className={styles.usersPanel}>
      <p className={styles.meta}>{t("hint")}</p>
      {images.isError ? <p className={styles.error}>{t("loadFailed")}</p> : null}
      {images.isLoading ? <p className={styles.meta}>{t("loading")}</p> : null}
      {images.data?.length === 0 ? <p className={styles.meta}>{t("empty")}</p> : null}
      <ul className={styles.list}>
        {images.data?.map((img) => {
          const isBlocked = blockedIds.has(img.owner.id);
          return (
            <li key={img.id} className={styles.card}>
              <div className={styles.cardHead} style={{ cursor: "default" }}>
                {/* eslint-disable-next-line @next/next/no-img-element -- превью пользовательской картинки */}
                <img src={img.url} alt="" width={56} height={56} loading="lazy" style={{ borderRadius: 8, objectFit: "cover", flex: "none" }} />
                <span className={styles.cardMain}>
                  <span className={styles.displayName}>{name(img.owner)}</span>
                  <span className={styles.cardSub}>
                    @{img.owner.username} · {new Date(img.createdAt).toLocaleString([], { dateStyle: "short", timeStyle: "short" })}
                  </span>
                </span>
              </div>
              <div className={styles.cardBody}>
                <div className={styles.row}>
                  <button
                    type="button"
                    className={styles.btnDanger}
                    disabled={remove.isPending}
                    onClick={() => {
                      if (window.confirm(t("deleteConfirm"))) remove.mutate(img.id);
                    }}
                  >
                    {t("delete")}
                  </button>
                  <button
                    type="button"
                    className={styles.btnGhost}
                    disabled={block.isPending}
                    onClick={() => block.mutate({ userId: img.owner.id, blocked: !isBlocked })}
                  >
                    {isBlocked ? t("unblock") : t("block")}
                  </button>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      {blocks.data && blocks.data.length > 0 ? (
        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>{t("blockedTitle")}</h3>
          <ul className={styles.list}>
            {blocks.data.map((b) => (
              <li key={b.userId} className={styles.row}>
                <span>{name(b)} (@{b.username})</span>
                <button type="button" className={styles.btnSmall} onClick={() => block.mutate({ userId: b.userId, blocked: false })}>
                  {t("unblock")}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
