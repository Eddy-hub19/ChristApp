"use client";

import AvatarWithFallback from "@/components/AvatarWithFallback/AvatarWithFallback";
import { resolvePublicAvatarUrl } from "@/lib/avatarUrl";
import { getInitials } from "@/lib/utils";
import styles from "./Cinema.module.scss";

type PersonAvatarProps = {
  user: { id: string; username: string; nickname: string | null; avatarUrl: string | null };
  size?: number;
  className?: string;
};

export default function PersonAvatar({ user, size = 36, className }: PersonAvatarProps) {
  const name = user.nickname || user.username;
  return (
    <span
      className={`${styles.avatar} ${className ?? ""}`}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.38) }}
    >
      <AvatarWithFallback
        src={resolvePublicAvatarUrl(user.avatarUrl)}
        initials={getInitials(name)}
        colorSeed={user.id}
        width={size}
        height={size}
        imageClassName={styles.avatarImage}
        fallbackClassName={styles.avatarFallback}
        fallbackTag="span"
        alt=""
      />
    </span>
  );
}
