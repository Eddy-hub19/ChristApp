"use client";

import { memo, useEffect, useId, useState } from "react";
import { useTranslations } from "next-intl";
import { Check, ChevronDown, Copy, MicOff, Sparkles } from "lucide-react";
import AvatarWithFallback from "@/components/AvatarWithFallback/AvatarWithFallback";
import type { AdminMember } from "@/lib/queries/adminQueries";
import AdminMemberRubies from "./AdminMemberRubies";
import AdminFlockMute from "./AdminFlockMute";
import { describeLastSeen, formatShortDate } from "./adminFormat";
import styles from "./admin.module.scss";

type Props = {
  member: AdminMember;
  isNew: boolean;
  muted: boolean;
  deleting: boolean;
  now: number;
  onDelete: (member: AdminMember) => void;
};

/** Компактна картка учасника: у згорнутому вигляді - один рядок і дві дрібні; технічне й дії - у розгорнутій частині. */
function AdminUserCard({ member, isNew, muted, deleting, now, onDelete }: Props) {
  const t = useTranslations("admin");
  const panelId = useId();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const id = window.setTimeout(() => setCopied(false), 1500);
    return () => window.clearTimeout(id);
  }, [copied]);

  const name = member.nickname?.trim() || member.username;
  const seen = describeLastSeen(member.lastSeenAt, now);
  const seenText =
    seen.kind === "never"
      ? t("neverOnline")
      : seen.kind === "now"
        ? t("seenNow")
        : seen.kind === "date"
          ? t("seenDate", { date: seen.text })
          : t(`seen_${seen.kind}`, { count: seen.count });

  const copyId = async () => {
    try {
      await navigator.clipboard.writeText(member.id);
      setCopied(true);
    } catch {
      /* буфер недоступний (небезпечний контекст) - нічого не робимо */
    }
  };

  return (
    <li className={styles.card}>
      <button
        type="button"
        className={styles.cardHead}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
      >
        <AvatarWithFallback
          src={member.avatarUrl}
          initials={name.slice(0, 1).toUpperCase()}
          colorSeed={member.id}
          width={36}
          height={36}
          imageClassName={styles.avatar}
          fallbackClassName={`${styles.avatar} ${styles.avatarFallback}`}
          fallbackTint="always"
          loading="lazy"
        />
        <span className={styles.cardMain}>
          <span className={styles.cardLine}>
            <span className={styles.displayName}>{name}</span>
            <span className={styles.handle}>@{member.username}</span>
            {isNew ? (
              <span className={`${styles.badge} ${styles.badgeNew}`}>
                <Sparkles size={11} aria-hidden /> {t("badgeNew")}
              </span>
            ) : null}
            <span className={`${styles.badge} ${member.isActive ? styles.badgeOn : styles.badgeOff}`}>
              <span className={styles.badgeDot} aria-hidden /> {member.isActive ? t("statusActive") : t("statusInactive")}
            </span>
            {muted ? (
              <span className={`${styles.badge} ${styles.badgeMuted}`}>
                <MicOff size={11} aria-hidden /> {t("badgeMuted")}
              </span>
            ) : null}
          </span>
          <span className={styles.cardSub}>
            {t("joinedShort", { date: formatShortDate(member.createdAt) })} · {seenText}
          </span>
        </span>
        <ChevronDown size={18} aria-hidden className={`${styles.chevron} ${open ? styles.chevronOpen : ""}`} />
      </button>

      {open ? (
        <div id={panelId} className={styles.cardBody}>
          <dl className={styles.facts}>
            <div>
              <dt>{t("labelId")}</dt>
              <dd className={styles.mono}>{member.id}</dd>
              <button type="button" className={styles.btnSmall} onClick={() => void copyId()}>
                {copied ? <Check size={14} aria-hidden /> : <Copy size={14} aria-hidden />} {copied ? t("copied") : t("copy")}
              </button>
            </div>
            <div>
              <dt>{t("labelEmail")}</dt>
              <dd>{member.email}</dd>
            </div>
          </dl>

          <AdminMemberRubies memberId={member.id} />
          <AdminFlockMute memberId={member.id} />

          <div className={styles.dangerZone}>
            {confirming ? (
              <>
                <p className={styles.dangerText}>{t("deleteConfirm", { name, username: member.username })}</p>
                <div className={styles.row}>
                  <button type="button" className={styles.btnGhost} onClick={() => setConfirming(false)}>
                    {t("cancel")}
                  </button>
                  <button
                    type="button"
                    className={styles.btnDanger}
                    disabled={deleting}
                    onClick={() => onDelete(member)}
                  >
                    {deleting ? t("deleting") : t("deleteConfirmYes")}
                  </button>
                </div>
              </>
            ) : (
              <button type="button" className={styles.btnDanger} onClick={() => setConfirming(true)}>
                {t("deleteMember")}
              </button>
            )}
          </div>
        </div>
      ) : null}
    </li>
  );
}

export default memo(AdminUserCard);
