"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@/i18n/navigation";
import {
  WatchApiError,
  createWatchRoom,
} from "@/lib/queries/watchRoomsQueries";
import PeoplePicker from "./PeoplePicker";
import Sheet from "./Sheet";
import VideoLinkField, { type PickedVideo } from "./VideoLinkField";
import { usePeopleDirectory } from "./usePeopleDirectory";
import styles from "./Cinema.module.scss";

type CreateWatchRoomSheetProps = {
  open: boolean;
  onClose: () => void;
  currentUserId: string | undefined;
};

export default function CreateWatchRoomSheet({
  open,
  onClose,
  currentUserId,
}: CreateWatchRoomSheetProps) {
  const t = useTranslations("cinema");
  const router = useRouter();
  const queryClient = useQueryClient();
  const { people, isLoading } = usePeopleDirectory(open ? currentUserId : undefined);

  const [title, setTitle] = useState("");
  const [video, setVideo] = useState<PickedVideo | null>(null);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showTitleError, setShowTitleError] = useState(false);

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const submit = async () => {
    if (!title.trim()) {
      setShowTitleError(true);
      return;
    }
    if (!video || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const room = await createWatchRoom({
        title: title.trim(),
        provider: video.provider,
        videoId: video.videoId,
        videoTitle: video.title ?? undefined,
        thumbnailUrl: video.thumbnailUrl ?? undefined,
        startSec: video.startSec || undefined,
        inviteeIds: [...selected],
      });
      void queryClient.invalidateQueries({ queryKey: ["watch-rooms"] });
      onClose();
      router.push(`/cinema/${room.id}`);
    } catch (err) {
      const code = err instanceof WatchApiError ? err.code : undefined;
      setError(
        code === "NOT_EMBEDDABLE" || code === "NOT_FOUND"
          ? t(`errors.${code}`)
          : err instanceof Error && err.message
            ? err.message
            : t("errors.generic"),
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Sheet
      open={open}
      title={t("create.title")}
      onClose={onClose}
      footer={
        <>
          {error ? (
            <p className={styles.fieldError} role="alert">
              {error}
            </p>
          ) : null}
          <div className={styles.sheetActions}>
            <button type="button" className={styles.ghostButton} onClick={onClose}>
              {t("create.cancel")}
            </button>
            <button
              type="button"
              className={styles.primaryButton}
              onClick={submit}
              disabled={!video || submitting}
            >
              {submitting ? t("create.submitting") : t("create.submit")}
            </button>
          </div>
        </>
      }
    >
      <div className={styles.field}>
        <label className={styles.fieldLabel} htmlFor="watch-room-title">
          {t("create.nameLabel")}
        </label>
        <input
          id="watch-room-title"
          className={styles.input}
          value={title}
          maxLength={80}
          onChange={(e) => {
            setTitle(e.target.value);
            if (e.target.value.trim()) setShowTitleError(false);
          }}
          placeholder={t("create.namePlaceholder")}
          aria-invalid={showTitleError}
        />
        {showTitleError ? (
          <p className={styles.fieldError} role="alert">
            {t("create.nameRequired")}
          </p>
        ) : null}
      </div>

      <VideoLinkField onChange={setVideo} />

      <div className={styles.field}>
        <span className={styles.fieldLabel}>{t("create.inviteLabel")}</span>
        <PeoplePicker
          people={people}
          isLoading={isLoading}
          selectedIds={selected}
          onToggle={toggle}
        />
      </div>
    </Sheet>
  );
}
