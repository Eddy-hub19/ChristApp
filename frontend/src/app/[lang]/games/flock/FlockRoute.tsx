"use client";

import { Suspense, useEffect } from "react";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { useRouter } from "@/i18n/navigation";
import { useAuth } from "@/hooks/useAuth";
import { flockInvitePath } from "@/lib/flockInviteMessage";
import { forgetPostLoginPath, rememberPostLoginPath } from "@/lib/postLoginRedirect";

// Арена вантажиться тільки коли гравець її відкрив (як і решта ігор).
const FlockMiniGame = dynamic(() => import("@/components/FlockMiniGame/FlockMiniGame"), { ssr: false });

function parseArena(raw: string | null): number | null {
  if (!raw || !/^\d{1,9}$/.test(raw)) return null;
  const n = Number(raw);
  return n > 0 ? n : null;
}

function FlockRouteInner() {
  const router = useRouter();
  const params = useSearchParams();
  const arenaId = parseArena(params.get("arena"));
  const { user, loading } = useAuth({ redirectIfUnauthenticated: "/" });

  // Не залогінений: useAuth відправить на вхід, а після входу ми повернемось сюди, на ту саму арену.
  useEffect(() => {
    rememberPostLoginPath(flockInvitePath(arenaId));
  }, [arenaId]);

  useEffect(() => {
    if (user) forgetPostLoginPath();
  }, [user]);

  if (loading || !user) return null;
  return <FlockMiniGame open userId={user.id} arenaId={arenaId} onClose={() => router.replace("/games")} />;
}

export default function FlockRoute() {
  return (
    <Suspense fallback={null}>
      <FlockRouteInner />
    </Suspense>
  );
}
