"use client";

import { useEffect } from "react";
import { useCalls } from "@/components/calls/CallProvider";
import { useCinema } from "@/components/Cinema/CinemaProvider";
import { usePathname } from "@/i18n/navigation";
import { isFullscreenPath } from "@/lib/fullscreenRoutes";
import { usePlayer } from "@/providers/playerContext";

/**
 * Ставит плеер на паузу, когда звук нужен другому: звонок (входящий, исходящий, идущий), игра на весь экран
 * («Отара» и др.), «Киношка» и фильмы. Возобновляется только вручную. Живёт под CallProvider и CinemaProvider,
 * поэтому PlayerProvider (он выше по дереву) сам этих состояний не видит.
 */
export default function PlayerAutoPause() {
  const { pause } = usePlayer();
  const { outgoing, incoming, active } = useCalls();
  const { activeRoomId } = useCinema();
  const pathname = usePathname();

  const inCall = Boolean(outgoing || incoming || active);
  const path = (pathname ?? "").replace(/\/+$/, "");
  const inMedia = isFullscreenPath(path) || path.startsWith("/cinema") || path.startsWith("/movie") || Boolean(activeRoomId);
  const busy = inCall || inMedia;

  useEffect(() => {
    if (busy) pause();
  }, [busy, pause]);

  return null;
}
