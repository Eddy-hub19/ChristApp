"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import { getAuthToken } from "@/lib/auth";
import { ensureAccessToken } from "@/lib/authSession";
import { openQuickInvite, type QuickInviteClient } from "@/lib/quickInvite";
import styles from "./games.module.scss";

const PuzzleMiniGame = dynamic(() => import("@/components/PuzzleMiniGame/PuzzleMiniGame"), { ssr: false });

type Props = {
  userId: string;
  myName?: string;
  myAvatarUrl?: string | null;
  onClose: () => void;
  onFail: () => void;
};

/**
 * Одиночні «Пазли» поза особистим чатом: сервер тримає сесію в кімнаті, тож беремо власну кімнату
 * «Поділися з Ісусом» (бекенд пускає туди лише власника) і окремий сокет. Режим «solo» запам'ятовується
 * для цієї кімнати, тож гра відкривається одразу в одиночному режимі.
 */
export default function SoloPuzzleHost({ userId, myName, myAvatarUrl, onClose, onFail }: Props) {
  const t = useTranslations("games");
  const [ready, setReady] = useState<{ roomId: string; client: QuickInviteClient } | null>(null);
  const clientRef = useRef<QuickInviteClient | null>(null);
  const failRef = useRef(onFail);
  useEffect(() => {
    failRef.current = onFail;
  }, [onFail]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        let token = getAuthToken();
        if (!token) token = await ensureAccessToken();
        const client = openQuickInvite(token);
        clientRef.current = client;
        let roomId = await client.resolveSelfRoom();
        if (!roomId && !cancelled) roomId = await client.resolveSelfRoom();
        if (cancelled) return;
        if (!roomId) throw new Error("no self room");
        try {
          window.localStorage.setItem(`christapp:puzzle:mode:${roomId}`, "solo");
        } catch {
          // приватний режим: гра відкриється в режимі за замовчуванням
        }
        setReady({ roomId, client });
      } catch {
        if (!cancelled) failRef.current();
      }
    })();
    return () => {
      cancelled = true;
      clientRef.current?.close();
      clientRef.current = null;
    };
  }, []);

  if (!ready) {
    return (
      <p className={styles.connecting} role="status">
        {t("connecting")}
      </p>
    );
  }
  return (
    <PuzzleMiniGame
      open
      roomId={ready.roomId}
      socket={ready.client.socket}
      userId={userId}
      peerName=""
      myName={myName}
      myAvatarUrl={myAvatarUrl}
      onClose={onClose}
    />
  );
}
