"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Check, Link2, Maximize, MessageSquare, Minimize, Play, SlidersHorizontal } from "lucide-react";
import {
  formatPlaybackTime,
  manualElapsedSec,
  manualSecondsLeft,
  type ManualSyncState,
  type ServerClock,
} from "@/lib/watchSync";
import styles from "./CinemaHall.module.scss";

/** Через скільки мс без активності панель ховається. */
const PANEL_AUTOHIDE_MS = 5_000;

type ManualSyncControlsProps = {
  manual: ManualSyncState;
  clock: ServerClock;
  isHost: boolean;
  isReady: boolean;
  readyCount: number;
  totalCount: number;
  onToggleReady: () => void;
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
  chatOverlayEnabled?: boolean;
  onToggleChatOverlay?: () => void;
};

/**
 * Оверлей для IFRAME/MANUAL поверх екрана (рендериться всередині `.screen`, тож однаково працює на
 * мобільному, десктопі й у fullscreen): немає програмного керування чужим плеєром, тож синхронізуємо
 * МОМЕНТ, а не позицію — спільний відлік 3-2-1 за серверним годинником, готовність учасників і
 * пауза/резюм для всіх одразу.
 *
 * iframe забирає на себе всі дотики, тож панель не може "ховатись по тапу на відео". Замість цього:
 * панель напівпрозора, накладається на низ відео й сама ховається через 5с; після цього в кутку
 * лишається маленька кнопка (у фазі running — з таймером), тап по якій показує панель знову.
 * Панель сама з'являється, коли в кімнаті щось змінюється (старт, відлік, пауза/резюм, готовність,
 * хтось зайшов/вийшов), а протягом відліку 3-2-1 не ховається взагалі.
 */
export default function ManualSyncControls({
  manual,
  clock,
  isHost,
  isReady,
  readyCount,
  totalCount,
  onToggleReady,
  onStart,
  onPause,
  onResume,
  isFullscreen,
  onToggleFullscreen,
  chatOverlayEnabled,
  onToggleChatOverlay,
}: ManualSyncControlsProps) {
  const t = useTranslations("cinema.hall");
  // Відлік читаємо з годинника (clock.now()), тож для живого "3…2…1" потрібен власний тік.
  const [, tick] = useState(0);

  useEffect(() => {
    if (manual.phase !== "countdown" && manual.phase !== "running") return;
    // countdown: 200мс для плавного "3…2…1"; running: раз на секунду досить для лічильника.
    const id = setInterval(() => tick((n) => n + 1), manual.phase === "countdown" ? 200 : 1000);
    return () => clearInterval(id);
  }, [manual.phase]);

  // ===== Автоховання =====
  const [visible, setVisible] = useState(true);
  /** Лічильник взаємодій: кожна скидає таймер ховання (залежність ефекту нижче). */
  const [interactions, setInteractions] = useState(0);
  const lastMoveBumpRef = useRef(0);

  // Будь-яка зміна в кімнаті, що стосується ручної синхронізації, показує панель заново
  // ("підлаштування стану під час рендера" — без ефекту, щоб не було зайвого проходу).
  const changeKey = `${manual.phase}|${manual.countdownEndsAt ?? ""}|${manual.readyUserIds.length}|${totalCount}`;
  const [seenChangeKey, setSeenChangeKey] = useState(changeKey);
  if (changeKey !== seenChangeKey) {
    setSeenChangeKey(changeKey);
    setVisible(true);
  }

  const inCountdown = manual.phase === "countdown";
  const shown = visible || inCountdown;

  useEffect(() => {
    // Відлік: панель стоїть, доки він іде; таймер стартує вже після нього (зміна phase).
    if (!visible || inCountdown) return;
    const id = setTimeout(() => setVisible(false), PANEL_AUTOHIDE_MS);
    return () => clearTimeout(id);
  }, [visible, inCountdown, interactions, changeKey]);

  const reveal = () => {
    setVisible(true);
    setInteractions((n) => n + 1);
  };
  const touchPanel = () => setInteractions((n) => n + 1);
  // Рух курсору над панеллю теж продовжує показ (не частіше разу на 400мс, щоб не перерендерювати
  // компонент на кожен піксель). Свідомо не "hover-пауза": cross-origin iframe ковтає події, тож
  // pointerleave при різкому виході курсору в iframe не гарантований — панель могла б застрягти.
  const handlePanelPointerMove = (e: React.PointerEvent) => {
    if (e.pointerType !== "mouse") return;
    const now = Date.now();
    if (now - lastMoveBumpRef.current < 400) return;
    lastMoveBumpRef.current = now;
    touchPanel();
  };

  const secondsLeft =
    inCountdown && manual.countdownEndsAt !== null
      ? manualSecondsLeft(manual.countdownEndsAt, clock.now())
      : null;
  const elapsedText =
    manual.phase === "running" ? formatPlaybackTime(manualElapsedSec(manual, clock.now())) : null;

  return (
    <div className={styles.manualOverlay}>
      {/* Тонка смужка внизу екрана: на десктопі (курсор) рух курсору по ній показує панель (саме
          рух, а не pointerenter: після ховання смужка зʼявляється під застарілою позицією курсору,
          і enter без руху зациклив би показ). iframe ковтає
          події миші, тож іншого способу "наведення на низ плеєра" немає; смужка вузька, щоб не
          перекривати кнопки самого сайту. */}
      {!shown ? (
        <span className={styles.manualHoverZone} onPointerMove={(e) => e.pointerType === "mouse" && reveal()} aria-hidden />
      ) : null}

      {!shown ? (
        <button
          type="button"
          className={styles.manualCorner}
          onClick={reveal}
          aria-label={t("manualShowPanel")}
        >
          <SlidersHorizontal size={14} aria-hidden />
          {elapsedText ? <span className={styles.manualCornerTime}>{elapsedText}</span> : null}
        </button>
      ) : null}

      <div
        className={`${styles.manualPanel} ${shown ? styles.manualPanelShown : ""}`}
        onPointerDownCapture={touchPanel}
        onKeyDownCapture={touchPanel}
        onFocusCapture={touchPanel}
        onPointerMove={handlePanelPointerMove}
        aria-hidden={!shown}
      >
        <span className={styles.manualBadge} title={t("manualSync")}>
          <Link2 size={12} aria-hidden />
          <span className={styles.manualBadgeLabel}>{t("manualSync")}</span>
        </span>

        <div className={styles.manualMain}>
          {secondsLeft !== null ? (
            <span className={styles.manualCountdown} aria-live="assertive">
              {secondsLeft > 0 ? secondsLeft : "▶"}
            </span>
          ) : manual.phase === "idle" ? (
            <>
              <button
                type="button"
                className={`${styles.manualReadyButton} ${isReady ? styles.manualReadyActive : ""}`}
                onClick={onToggleReady}
                aria-pressed={isReady}
              >
                {isReady ? <Check size={14} aria-hidden /> : null} {t("manualReady")}
              </button>
              <span className={styles.manualReadyCount}>
                {t("manualReadyCount", { ready: readyCount, total: totalCount })}
              </span>
              {isHost ? (
                <button type="button" className={styles.manualPrimaryButton} onClick={onStart}>
                  <Play size={14} fill="currentColor" aria-hidden /> {t("manualStart")}
                </button>
              ) : null}
            </>
          ) : manual.phase === "running" ? (
            <>
              <span className={styles.manualStatusText}>
                {t("manualRunningElapsed", { time: elapsedText ?? "" })}
              </span>
              {isHost ? (
                <button type="button" className={styles.manualPrimaryButton} onClick={onPause}>
                  {t("manualPauseForAll")}
                </button>
              ) : null}
            </>
          ) : (
            <>
              <span className={styles.manualStatusText}>{t("manualPaused")}</span>
              {isHost ? (
                <button type="button" className={styles.manualPrimaryButton} onClick={onResume}>
                  {t("manualResume")}
                </button>
              ) : null}
            </>
          )}
        </div>

        {isFullscreen && onToggleChatOverlay ? (
          <button
            type="button"
            className={`${styles.hallIconButton} ${chatOverlayEnabled ? styles.mobileIconButtonActive : ""}`}
            onClick={onToggleChatOverlay}
            aria-pressed={chatOverlayEnabled}
            aria-label={chatOverlayEnabled ? t("chatOverlayOff") : t("chatOverlayOn")}
            title={chatOverlayEnabled ? t("chatOverlayOff") : t("chatOverlayOn")}
          >
            <MessageSquare size={18} />
          </button>
        ) : null}

        <button
          type="button"
          className={styles.hallIconButton}
          onClick={onToggleFullscreen}
          aria-label={isFullscreen ? t("exitFullscreen") : t("fullscreen")}
        >
          {isFullscreen ? <Minimize size={18} /> : <Maximize size={18} />}
        </button>
      </div>
    </div>
  );
}
