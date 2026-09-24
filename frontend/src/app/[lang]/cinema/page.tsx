"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Clapperboard, Plus } from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import { useAuth } from "@/hooks/useAuth";
import CreateWatchRoomSheet from "@/components/Cinema/CreateWatchRoomSheet";
import WatchRoomCard from "@/components/Cinema/WatchRoomCard";
import {
  acceptWatchInvite,
  declineWatchInvite,
  fetchWatchRooms,
  watchRoomsQueryKey,
} from "@/lib/queries/watchRoomsQueries";
import styles from "@/components/Cinema/Cinema.module.scss";

export default function CinemaPage() {
  const t = useTranslations("cinema");
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user } = useAuth({ redirectIfUnauthenticated: "/" });
  const [createOpen, setCreateOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const query = useQuery({
    queryKey: watchRoomsQueryKey(user?.id),
    queryFn: fetchWatchRooms,
    enabled: Boolean(user?.id),
    refetchInterval: 20_000,
  });

  const respond = async (roomId: string, accept: boolean) => {
    setBusyId(roomId);
    try {
      if (accept) {
        await acceptWatchInvite(roomId);
        router.push(`/cinema/${roomId}`);
      } else {
        await declineWatchInvite(roomId);
      }
    } finally {
      setBusyId(null);
      void queryClient.invalidateQueries({ queryKey: ["watch-rooms"] });
    }
  };

  const rooms = query.data?.rooms ?? [];
  const invitations = query.data?.invitations ?? [];

  return (
    <section className={styles.page}>
      <header className={styles.pageHeader}>
        <span className={styles.pageIcon} aria-hidden>
          <Clapperboard size={22} />
        </span>
        <div>
          <h1 className={styles.pageTitle}>{t("title")}</h1>
          <p className={styles.pageSubtitle}>{t("subtitle")}</p>
        </div>
        <button type="button" className={styles.createButton} onClick={() => setCreateOpen(true)}>
          <Plus size={18} aria-hidden />
          <span>{t("createRoom")}</span>
        </button>
      </header>

      <div className={styles.pageScroll}>
        {invitations.length > 0 ? (
          <>
            <h2 className={styles.sectionTitle}>
              {t("invitations")} <span className={styles.sectionCount}>{invitations.length}</span>
            </h2>
            <ul className={styles.cards}>
              {invitations.map((room, index) => (
                <WatchRoomCard
                  key={room.id}
                  room={room}
                  index={index}
                  invitation={{
                    busy: busyId === room.id,
                    onAccept: () => void respond(room.id, true),
                    onDecline: () => void respond(room.id, false),
                  }}
                />
              ))}
            </ul>
          </>
        ) : null}

        <h2 className={styles.sectionTitle}>{t("myRooms")}</h2>
        {query.isLoading ? (
          <ul className={styles.cards}>
            {[0, 1].map((i) => (
              <li key={i} className={`${styles.card} ${styles.cardSkeleton}`} />
            ))}
          </ul>
        ) : query.isError ? (
          <div className={styles.empty}>
            <p>{t("loadError")}</p>
            <button type="button" className={styles.ghostButton} onClick={() => void query.refetch()}>
              {t("retry")}
            </button>
          </div>
        ) : rooms.length === 0 ? (
          <div className={styles.empty}>
            <span className={styles.emptyIcon} aria-hidden>🎬</span>
            <p>{t("empty")}</p>
            <button type="button" className={styles.primaryButton} onClick={() => setCreateOpen(true)}>
              {t("createRoom")}
            </button>
          </div>
        ) : (
          <ul className={styles.cards}>
            {rooms.map((room, index) => (
              <WatchRoomCard key={room.id} room={room} index={index} />
            ))}
          </ul>
        )}
      </div>

      <CreateWatchRoomSheet
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        currentUserId={user?.id}
      />
    </section>
  );
}
