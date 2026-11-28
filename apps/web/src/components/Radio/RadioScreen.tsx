"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Headphones, Pause, Play, Plus, Users, Volume2 } from "lucide-react";
import AvatarWithFallback from "@/components/AvatarWithFallback/AvatarWithFallback";
import { useAuth } from "@/hooks/useAuth";
import { resolvePublicAvatarUrl } from "@/lib/avatarUrl";
import { formatTime } from "@/components/SheepPlayer/SheepPlayerSheet";
import { usePlayer } from "@/providers/playerContext";
import { useRadio } from "@/providers/radioContext";
import RadioAdminSheet from "./RadioAdminSheet";
import styles from "./Radio.module.scss";

/** Высоты столбиков «волны»: статичный рисунок, оживает (scaleY) только пока играет эфир. */
const WAVE = [34, 52, 70, 46, 82, 60, 40, 74, 92, 58, 36, 66, 84, 50, 72, 44, 88, 62, 38, 78, 56, 68, 42, 80];

function Cover({ url, className }: { url: string | null | undefined; className: string }) {
  return url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt="" className={className} loading="lazy" decoding="async" />
  ) : (
    <span className={`${className} ${styles.coverFallback}`} aria-hidden>
      <Headphones size={28} />
    </span>
  );
}

/** Экран «Christ Radio»: единый эфир, плеер, слушатели онлайн и «Недавно в эфире»; для админа - управление очередью. */
export default function RadioScreen() {
  const t = useTranslations("radio");
  const radio = useRadio();
  const player = usePlayer();
  const { user } = useAuth();
  const [adminOpen, setAdminOpen] = useState(false);
  const [peopleOpen, setPeopleOpen] = useState(false);
  const peopleRef = useRef<HTMLDivElement | null>(null);
  const [, setTick] = useState(0);

  const { state, listeners, listenerUsers, tunedIn, status, watch } = radio;
  const track = state?.track ?? null;
  const online = Boolean(state?.online && track);

  // Пока экран открыт - сокет жив: приходят смена трека и счётчик слушателей.
  useEffect(() => watch(), [watch]);

  // Список слушателей закрывается кликом/касанием вне его и по Escape.
  useEffect(() => {
    if (!peopleOpen) return;
    const onDown = (e: PointerEvent) => {
      if (!peopleRef.current?.contains(e.target as Node)) setPeopleOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPeopleOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [peopleOpen]);

  // Секундный тик для полоски прогресса (позиция считается по часам сервера, звук для этого не нужен).
  useEffect(() => {
    if (!online) return;
    const id = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [online]);

  const duration = track?.durationSec ?? 0;
  const position = online ? Math.min(radio.positionSec(), duration) : 0;
  const listening = tunedIn && status === "listening" && player.isPlaying;

  const statusText = !state
    ? t("loading")
    : !online
      ? t("offline")
      : !tunedIn
        ? t("tuneInHint")
        : status === "connecting"
          ? t("connecting")
          : status === "blocked"
            ? t("tapToListen")
            : status === "error"
              ? t("error")
              : t("listeningNow");

  const onMainButton = () => {
    if (tunedIn && status !== "blocked") radio.leave();
    else radio.tuneIn();
  };
  const mainLabel = tunedIn && status !== "blocked" ? t("leave") : t("tuneIn");

  return (
    <section className={styles.page}>
      <header className={styles.header}>
        <span className={styles.headerIcon} aria-hidden>
          <Headphones size={22} />
        </span>
        <div className={styles.headerText}>
          <h1>{t("title")}</h1>
          <p>{t("subtitle")}</p>
        </div>
        <button type="button" className={styles.adminBtn} onClick={() => setAdminOpen(true)} aria-label={t("manage")} title={t("manage")}>
          <Plus size={20} aria-hidden />
        </button>
      </header>

      <div className={styles.scroll}>
        <article className={styles.live} aria-label={t("liveCard")}>
          <div className={styles.coverWrap}>
            <Cover url={track?.coverUrl} className={styles.cover} />
            <span className={styles.coverShade} aria-hidden />
            <div className={styles.badges}>
              {online ? <span className={styles.livePill}>{t("live")}</span> : <span />}
              <div className={styles.peopleWrap} ref={peopleRef}>
                <button
                  type="button"
                  className={styles.listeners}
                  onClick={() => setPeopleOpen((v) => !v)}
                  aria-label={t("listeners", { count: listeners })}
                  aria-haspopup="dialog"
                  aria-expanded={peopleOpen}
                >
                  <Users size={14} aria-hidden />
                  {listeners}
                </button>
                {peopleOpen ? (
                  <div className={styles.people} role="dialog" aria-label={t("listenersTitle")}>
                    <p className={styles.peopleTitle}>{t("listenersTitle")}</p>
                    {listenerUsers.length === 0 ? (
                      <p className={styles.peopleEmpty}>{t("noListeners")}</p>
                    ) : (
                      <ul className={styles.peopleList}>
                        {listenerUsers.map((u) => (
                          <li key={u.id} className={styles.person}>
                            <AvatarWithFallback
                              src={resolvePublicAvatarUrl(u.avatarUrl)}
                              initials={(u.name.trim()[0] ?? "?").toUpperCase()}
                              colorSeed={u.id}
                              width={28}
                              height={28}
                              imageClassName={styles.personAvatar}
                              fallbackClassName={`${styles.personAvatar} ${styles.personInitials}`}
                              fallbackTag="span"
                              fallbackTint="always"
                            />
                            <span className={styles.personName}>{u.name}</span>
                            {u.id === user?.id ? <span className={styles.personYou}>{t("you")}</span> : null}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          <div className={styles.body}>
            <p className={styles.kicker}>{t("nowOnAir")}</p>
            <h2 className={styles.trackTitle}>{track?.title ?? t("offlineTitle")}</h2>
            <p className={styles.trackArtist}>{track ? track.artist || t("unknownArtist") : t("offlineText")}</p>

            <button
              type="button"
              className={styles.mainBtn}
              onClick={onMainButton}
              disabled={!online}
              aria-label={mainLabel}
              aria-pressed={tunedIn && status !== "blocked"}
            >
              {listening || (tunedIn && status !== "blocked") ? <Pause size={30} aria-hidden /> : <Play size={30} aria-hidden />}
            </button>

            <div className={styles.wave} data-playing={listening ? "true" : "false"} aria-hidden>
              {WAVE.map((h, i) => (
                <span key={i} style={{ height: `${h}%`, ["--i" as string]: i }} />
              ))}
            </div>
            <div
              className={styles.progress}
              role="progressbar"
              aria-label={t("progress")}
              aria-valuemin={0}
              aria-valuemax={Math.round(duration)}
              aria-valuenow={Math.round(position)}
              aria-valuetext={`${formatTime(position)} / ${formatTime(duration)}`}
            >
              <span className={styles.progressFill} style={{ transform: `scaleX(${duration ? Math.min(1, position / duration) : 0})` }} />
            </div>
            <div className={styles.times} aria-hidden>
              <span>{formatTime(position)}</span>
              <span>{formatTime(duration)}</span>
            </div>

            <p className={styles.status} role="status" aria-live="polite">
              {statusText}
              {tunedIn && status === "error" ? (
                <>
                  {" "}
                  <button type="button" className={styles.linkBtn} onClick={radio.refresh}>
                    {t("retry")}
                  </button>
                </>
              ) : null}
            </p>

            {player.canSetVolume ? (
              <label className={styles.volume}>
                <Volume2 size={18} aria-hidden />
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={player.volume}
                  onChange={(e) => player.setVolume(parseFloat(e.target.value))}
                  aria-label={t("volume")}
                  aria-valuetext={`${Math.round(player.volume * 100)}%`}
                />
              </label>
            ) : null}
          </div>
        </article>
      </div>

      <RadioAdminSheet open={adminOpen} onClose={() => setAdminOpen(false)} />
    </section>
  );
}
