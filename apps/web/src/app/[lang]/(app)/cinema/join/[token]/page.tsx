"use client";

import { use, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";
import { Link, useRouter } from "@/i18n/navigation";
import { useAuth } from "@/hooks/useAuth";
import { joinWatchRoomByToken } from "@/lib/queries/watchRoomsQueries";
import { forgetPostLoginPath, rememberPostLoginPath } from "@/lib/postLoginRedirect";
import styles from "@/components/Cinema/Cinema.module.scss";

/** Вхід за посиланням-запрошенням: будь-хто залогінений стає учасником і потрапляє в залу. */
export default function CinemaJoinPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const t = useTranslations("cinema.join");
  const router = useRouter();
  const { user, loading } = useAuth({ redirectIfUnauthenticated: "/" });
  const [failed, setFailed] = useState(false);

  // Якщо користувач не залогінений, useAuth відправить його на вхід — після входу повернемося сюди.
  useEffect(() => {
    rememberPostLoginPath(`/cinema/join/${token}`);
  }, [token]);

  useEffect(() => {
    if (loading || !user) return;
    let cancelled = false;
    joinWatchRoomByToken(token)
      .then(({ roomId }) => {
        forgetPostLoginPath();
        if (!cancelled) router.replace(`/cinema/${roomId}`);
      })
      .catch(() => {
        forgetPostLoginPath();
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [token, user, loading, router]);

  return (
    <section className={styles.page}>
      <div className={styles.empty}>
        {failed ? (
          <>
            <span className={styles.emptyIcon} aria-hidden>🎟️</span>
            <p>{t("invalid")}</p>
            <Link href="/cinema" className={styles.primaryButton}>
              {t("toList")}
            </Link>
          </>
        ) : (
          <>
            <Loader2 size={26} className={styles.spin} aria-hidden />
            <p>{t("joining")}</p>
          </>
        )}
      </div>
    </section>
  );
}
