"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Copy, RefreshCw } from "lucide-react";
import { inviteToWatchRoom, rotateWatchInviteToken } from "@/lib/queries/watchRoomsQueries";
import PeoplePicker from "./PeoplePicker";
import Sheet from "./Sheet";
import { usePeopleDirectory } from "./usePeopleDirectory";
import type { HallMember } from "./useWatchHall";
import styles from "./Cinema.module.scss";

type InviteSheetProps = {
  open: boolean;
  onClose: () => void;
  roomId: string;
  currentUserId: string | undefined;
  isHost: boolean;
  members: HallMember[];
  inviteToken: string | null;
  onToast: (text: string) => void;
};

export function buildInviteUrl(token: string) {
  const lang = window.location.pathname.split("/")[1] || "ua";
  return `${window.location.origin}/${lang}/cinema/join/${token}`;
}

export default function InviteSheet({
  open,
  onClose,
  roomId,
  currentUserId,
  isHost,
  members,
  inviteToken,
  onToast,
}: InviteSheetProps) {
  const t = useTranslations("cinema");
  const { people, isLoading } = usePeopleDirectory(open ? currentUserId : undefined);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [token, setToken] = useState(inviteToken);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => setToken(inviteToken), [inviteToken]);

  const locked = useMemo(() => {
    const map = new Map<string, string>();
    for (const m of members) {
      map.set(
        m.id,
        m.status === "JOINED" ? t("people.alreadyIn") : t("people.alreadyInvited"),
      );
    }
    return map;
  }, [members, t]);

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const copyLink = async () => {
    if (!token) return;
    const url = buildInviteUrl(token);
    try {
      if (navigator.share && window.matchMedia("(pointer: coarse)").matches) {
        await navigator.share({ title: t("title"), url });
        return;
      }
      await navigator.clipboard.writeText(url);
      onToast(t("hall.linkCopied"));
    } catch {
      // користувач закрив системне меню «Поділитися» — нічого страшного
    }
  };

  const resetLink = async () => {
    try {
      const res = await rotateWatchInviteToken(roomId);
      setToken(res.token);
      onToast(t("hall.linkReset"));
    } catch {
      onToast(t("errors.generic"));
    }
  };

  const submit = async () => {
    if (!selected.size || submitting) return;
    setSubmitting(true);
    try {
      await inviteToWatchRoom(roomId, [...selected]);
      setSelected(new Set());
      onToast(t("hall.invitesSent"));
      onClose();
    } catch {
      onToast(t("errors.generic"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Sheet
      open={open}
      title={t("hall.invite")}
      onClose={onClose}
      tone="hall"
      footer={
        <div className={styles.sheetActions}>
          <button type="button" className={styles.ghostButton} onClick={onClose}>
            {t("create.cancel")}
          </button>
          <button
            type="button"
            className={styles.primaryButton}
            onClick={submit}
            disabled={!selected.size || submitting}
          >
            {t("hall.sendInvites")}
          </button>
        </div>
      }
    >
      <div className={styles.inviteLinkRow}>
        <button type="button" className={styles.secondaryButton} onClick={copyLink} disabled={!token}>
          <Copy size={16} aria-hidden /> {t("hall.copyLink")}
        </button>
        {isHost ? (
          <button
            type="button"
            className={styles.iconButton}
            onClick={resetLink}
            title={t("hall.resetLinkHint")}
            aria-label={t("hall.resetLink")}
          >
            <RefreshCw size={16} />
          </button>
        ) : null}
      </div>
      <PeoplePicker
        people={people}
        isLoading={isLoading}
        selectedIds={selected}
        onToggle={toggle}
        lockedLabels={locked}
      />
    </Sheet>
  );
}
