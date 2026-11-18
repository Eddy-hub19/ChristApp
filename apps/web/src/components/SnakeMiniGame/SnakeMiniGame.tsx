"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import SnakeClassicBoard, {
  CELL_SIZE,
  CLASSIC_BOARD_CELLS_X,
  CLASSIC_BOARD_CELLS_Y,
  type SnakeRuntimeState,
} from "./SnakeClassicBoard";
import SnakeDuelBoard from "./SnakeDuelBoard";
import { SNAKE_LEVELS, getSnakeLevel } from "./snakeLevels";
import {
  getBestScore,
  getDuelRecord,
  recordBestScore,
  recordDuelResult,
} from "./snakeStats";
import {
  createClassicInput,
  queueClassicDirection,
  type ClassicInput,
  type Dir,
  type SnakeSocket,
} from "./snakeTypes";
import { useKeyboardDirection, useSwipeDirection } from "./useSnakeControls";
import { useSnakeSession } from "./useSnakeSession";
import styles from "./SnakeMiniGame.module.scss";

export type { SnakeRuntimeState } from "./SnakeClassicBoard";

type SnakeMiniGameProps = {
  open: boolean;
  roomId: string | null;
  socket: SnakeSocket | null;
  userId: string;
  myScore: number;
  peerScore: number;
  peerName: string;
  peerState: SnakeRuntimeState | null;
  /** Реально виміряний RTT; null — не вимірювався, рядок із пінгом ховаємо. */
  pingMs?: number | null;
  onClose: () => void;
  onScoreChange: (score: number) => void;
  onStateChange?: (state: SnakeRuntimeState) => void;
  /** Який режим зараз «відкритий» у цього гравця — для статусу «грає у Snake» і кнопки «Приєднатися». */
  onModeChange?: (mode: "classic" | "duel" | null) => void;
};

/**
 * Оболонка Snake: вибір рівня і сама гра обраного рівня.
 * Рівень 1 «Класика» — локальна й стартує одразу, без «Готовий» і без очікування другого гравця.
 * Рівень 2 (та майбутні `kind: "server"`) — гру веде сервер; «Готовий» від обох потрібен лише тут.
 */
export default function SnakeMiniGame({
  open,
  roomId,
  socket,
  userId,
  myScore,
  peerScore,
  peerName,
  peerState,
  pingMs,
  onClose,
  onScoreChange,
  onStateChange,
  onModeChange,
}: SnakeMiniGameProps) {
  const t = useTranslations("snake");
  const { session, connected, selectLevel, setReady, sendDirection } = useSnakeSession({
    socket,
    roomId,
    open,
  });

  const peerId = useMemo(
    () => session?.players.find((id) => id !== userId) ?? null,
    [session, userId],
  );

  // ── Класика (рівень 1): локальна гра ──
  const classicCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const classicInputRef = useRef<ClassicInput>(createClassicInput());
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [classicView, setClassicView] = useState(false);
  const [classicRunId, setClassicRunId] = useState(0);
  const [classicRunning, setClassicRunning] = useState(false);
  const [classicResult, setClassicResult] = useState<number | null>(null);
  const [bests, setBests] = useState<Record<number, number>>({});

  // ── Дуель (рівень 2) ──
  const duelDirectionRef = useRef<((dir: Dir) => void) | null>(null);
  const registerDirectionHandler = useCallback((handler: ((dir: Dir) => void) | null) => {
    duelDirectionRef.current = handler;
  }, []);
  const [lobbyOverride, setLobbyOverride] = useState(false);
  const [record, setRecord] = useState({ wins: 0, losses: 0 });
  const recordedMatchRef = useRef(false);
  const [classicNewRecord, setClassicNewRecord] = useState(false);
  const [duelNewRecord, setDuelNewRecord] = useState(false);

  useEffect(() => {
    if (!open) {
      setClassicView(false);
      setClassicRunning(false);
      setClassicResult(null);
      setLobbyOverride(false);
      return;
    }
    setBests({ 1: getBestScore(userId, 1), 2: getBestScore(userId, 2) });
  }, [open, userId]);

  useEffect(() => {
    if (peerId) setRecord(getDuelRecord(userId, peerId));
  }, [peerId, userId]);

  // «Класика»: стартує одразу, як гравець її вибрав. Серверу нічого не кажемо про рівень (щоб не збити
  // очікування другого в лобі Дуелі), лише знімаємо власну «готовність» до Дуелі, щоб вона не стартувала за спиною.
  const startClassic = useCallback(() => {
    if (session?.ready[userId]) setReady(false);
    classicInputRef.current = createClassicInput();
    setClassicResult(null);
    setClassicNewRecord(false);
    setLobbyOverride(false);
    setClassicView(true);
    setClassicRunning(true);
    setClassicRunId((id) => id + 1);
    onScoreChange(0);
  }, [session, userId, setReady, onScoreChange]);

  // Серверна дуель зрушила з місця — повертаємось до поля й скидаємо ручний «показати лобі».
  useEffect(() => {
    if (session?.phase === "countdown") setLobbyOverride(false);
  }, [session?.phase]);

  // Результат матчу пишемо в статистику один раз.
  useEffect(() => {
    if (!session) return;
    if (session.phase !== "matchEnd") {
      recordedMatchRef.current = false;
      return;
    }
    if (recordedMatchRef.current || !peerId || !session.matchWinner) return;
    recordedMatchRef.current = true;
    const before = getDuelRecord(userId, peerId);
    const won = session.matchWinner === userId;
    const after = recordDuelResult(userId, peerId, won ? "win" : "loss");
    setRecord(after);
    // «NEW!»: перемога вивела мене на лідерство в особистих зустрічах.
    setDuelNewRecord(won && before.wins <= before.losses && after.wins > after.losses);
  }, [session, peerId, userId]);

  const handleClassicGameOver = useCallback(
    (score: number) => {
      setClassicRunning(false);
      setClassicResult(score);
      setClassicNewRecord(score > 0 && score > getBestScore(userId, 1));
      setBests((prev) => ({ ...prev, 1: recordBestScore(userId, 1, score) }));
    },
    [userId],
  );

  const onClassicDirection = useCallback((dir: Dir) => {
    queueClassicDirection(classicInputRef.current, dir);
  }, []);
  useKeyboardDirection(open && classicRunning, onClassicDirection);

  const onDuelInput = useCallback(
    (dir: Dir) => sendDirection(dir),
    [sendDirection],
  );

  const level = getSnakeLevel(session?.level ?? 1);
  const serverGameActive =
    session != null &&
    level.kind === "server" &&
    session.phase !== "lobby" &&
    !lobbyOverride &&
    peerId != null;
  const view: "duel" | "classic" | "lobby" = serverGameActive
    ? "duel"
    : classicView
      ? "classic"
      : "lobby";

  const myReady = session ? Boolean(session.ready[userId]) : false;
  const peerReady = session && peerId ? Boolean(session.ready[peerId]) : false;
  const canChangeLevel = session != null && (session.phase === "lobby" || session.phase === "matchEnd");
  const myRace = session?.scores[userId] ?? 0;
  const peerRace = peerId ? (session?.scores[peerId] ?? 0) : 0;
  const raceTarget = session?.duel?.targetScore ?? 30;
  const duelSelected = (session?.level ?? 1) !== 1;

  const pressDirection = useCallback(
    (dir: Dir) => {
      if (view === "duel") duelDirectionRef.current?.(dir);
      else queueClassicDirection(classicInputRef.current, dir);
    },
    [view],
  );

  // Свайп ловимо на всій картці (не лише на canvas); поріг — ~0.6 клітинки в CSS-пікселях.
  const swipeMinPx = useCallback(() => {
    const canvas = classicCanvasRef.current ?? cardRef.current?.querySelector("canvas");
    const width = canvas?.clientWidth ?? 0;
    return width > 0 ? (width / CLASSIC_BOARD_CELLS_X) * 0.6 : 11;
  }, []);
  const duelLive = session?.phase === "playing" || session?.phase === "countdown";
  useSwipeDirection(
    cardRef,
    open && (view === "classic" ? classicRunning : view === "duel" && duelLive),
    pressDirection,
    swipeMinPx,
  );

  const pressControl = (dir: Dir) => {
    try {
      if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
        navigator.vibrate(8);
      }
    } catch {
      // вібрація недоступна — просто без відгуку
    }
    pressDirection(dir);
  };

  const handleChangeLevelFromResult = () => {
    setClassicView(false);
    setLobbyOverride(true);
  };

  const handlePlayAgainClassic = () => startClassic();

  const handleRematchDuel = () => {
    setClassicView(false);
    setLobbyOverride(true);
    setReady(true);
  };

  const iLead = myRace > peerRace || session?.matchWinner === userId;
  const peerLeads = peerRace > myRace || session?.matchWinner === peerId;
  const scoreLine =
    view === "classic" ? (
      <>
        {t("me")}: {myScore} {myScore > peerScore ? "👑" : ""} · {peerName}: {peerScore}{" "}
        {peerScore > myScore ? "👑" : ""}
      </>
    ) : null;
  const versusLabel = peerId
    ? t("versus", { name: peerName, wins: record.wins, losses: record.losses })
    : null;
  const metaLeft = view === "classic" ? t("best", { n: bests[1] ?? 0 }) : versusLabel;
  const duelCfg = session?.duelConfig;
  const levelDescParams = { n: duelCfg?.targetScore ?? 30, s: duelCfg?.respawnSec ?? 3 };

  // Режим для статусу «грає у Snake»: Класика/Дуель, або Дуель, якщо гравець чекає в її лобі.
  const mode: "classic" | "duel" | null =
    view === "classic" ? "classic" : view === "duel" || (duelSelected && myReady) ? "duel" : null;
  useEffect(() => {
    onModeChange?.(open ? mode : null);
  }, [open, mode, onModeChange]);

  const showControls = view !== "lobby";
  const hint = view === "duel" ? t("hintDuel") : t("hintClassic");

  if (!open) return null;

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div
        ref={cardRef}
        className={styles.card}
        role="dialog"
        aria-modal="true"
        aria-label="Snake"
        onClick={(event) => event.stopPropagation()}
      >
        <div className={styles.topRow}>
          <p className={styles.title}>Snake</p>
          <button type="button" className={styles.close} onClick={onClose} aria-label={t("close")}>
            ×
          </button>
        </div>
        {view === "duel" && session && peerId ? (
          <div className={styles.raceHud} aria-label={t("raceScoreAria")}>
            <p className={styles.raceLine}>
              {t("raceScore", { name: t("me"), n: myRace, target: raceTarget })} {iLead ? "👑" : ""} ·{" "}
              {t("raceScore", { name: peerName, n: peerRace, target: raceTarget })} {peerLeads ? "👑" : ""}
            </p>
            <div className={styles.raceBars}>
              <div
                className={styles.raceBar}
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={raceTarget}
                aria-valuenow={myRace}
              >
                <i className={styles.raceFillMine} style={{ width: `${Math.min(100, (myRace / raceTarget) * 100)}%` }} />
              </div>
              <div
                className={styles.raceBar}
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={raceTarget}
                aria-valuenow={peerRace}
              >
                <i className={styles.raceFillPeer} style={{ width: `${Math.min(100, (peerRace / raceTarget) * 100)}%` }} />
              </div>
            </div>
          </div>
        ) : scoreLine ? (
          <p className={styles.scoreLine}>{scoreLine}</p>
        ) : null}
        {metaLeft || pingMs != null ? (
          <div className={styles.metaRow}>
            <span>{metaLeft}</span>
            {pingMs != null ? (
              <span className={styles.pingText}>
                {t("ping")}: {t("pingValue", { ms: pingMs })}
              </span>
            ) : null}
          </div>
        ) : null}
        {socket && !connected ? (
          <p className={styles.reconnect} role="status" aria-live="polite">
            {t("reconnecting")}
          </p>
        ) : null}

        {view === "lobby" ? (
          <div className={styles.lobby}>
            <p className={styles.lobbyTitle}>{t("chooseLevel")}</p>
            <div className={styles.levelList} role="radiogroup" aria-label={t("chooseLevel")}>
              {SNAKE_LEVELS.map((def) => (
                <button
                  key={def.id}
                  type="button"
                  role="radio"
                  aria-checked={(session?.level ?? 1) === def.id}
                  disabled={def.kind === "classic" ? false : !canChangeLevel}
                  className={`${styles.levelCard} ${
                    (session?.level ?? 1) === def.id ? styles.levelCardActive : ""
                  }`}
                  onClick={() => (def.kind === "classic" ? startClassic() : selectLevel(def.id))}
                >
                  <span className={styles.levelName}>{t(def.nameKey)}</span>
                  <span className={styles.levelDesc}>{t(def.descKey, levelDescParams)}</span>
                </button>
              ))}
            </div>
            {!session ? <p className={styles.hint}>{t("connecting")}</p> : null}
            {session && peerId && duelSelected ? (
              <div className={styles.readyRow}>
                <span className={myReady ? styles.readyOk : undefined}>
                  {t("me")}: {myReady ? t("readyState") : t("notReady")}
                </span>
                <span className={peerReady ? styles.readyOk : undefined}>
                  {peerName}: {peerReady ? t("readyState") : t("waitingState")}
                </span>
              </div>
            ) : null}
            {classicResult !== null ? (
              <p className={styles.bestLine}>{t("lastResult", { n: classicResult })}</p>
            ) : null}
            {duelSelected ? (
              <div className={styles.lobbyActions}>
                <button
                  type="button"
                  className={styles.startButton}
                  disabled={!session}
                  onClick={() => setReady(!myReady)}
                >
                  {myReady ? t("cancelReady") : t("ready")}
                </button>
              </div>
            ) : (
              <p className={styles.hint}>{t("classicNoWait")}</p>
            )}
          </div>
        ) : (
          <>
            <p className={styles.hint}>{hint}</p>
            <div className={styles.canvasWrap}>
              {view === "classic" ? (
                <>
                  <SnakeClassicBoard
                    runId={classicRunId}
                    running={classicRunning}
                    inputRef={classicInputRef}
                    peerState={peerState}
                    peerName={peerName}
                    onScoreChange={onScoreChange}
                    onStateChange={onStateChange}
                    onGameOver={handleClassicGameOver}
                    canvasRef={classicCanvasRef}
                  />
                  {!classicRunning && classicResult !== null ? (
                    <div className={styles.resultPanel}>
                      <span className={styles.overlayTitle}>{t("gameOver")}</span>
                      <span className={styles.overlaySub}>{t("score", { n: classicResult })}</span>
                      {classicNewRecord ? <span className={styles.newRecord}>{t("newRecord")}</span> : null}
                      <div className={styles.overlayActions}>
                        <button type="button" className={styles.startButton} onClick={handlePlayAgainClassic}>
                          {t("playAgain")}
                        </button>
                        <button
                          type="button"
                          className={styles.secondaryButton}
                          onClick={handleChangeLevelFromResult}
                        >
                          {t("changeLevel")}
                        </button>
                      </div>
                    </div>
                  ) : null}
                </>
              ) : session && peerId ? (
                <SnakeDuelBoard
                  session={session}
                  myId={userId}
                  peerId={peerId}
                  peerName={peerName}
                  onDirection={onDuelInput}
                  onRematch={handleRematchDuel}
                  onChangeLevel={handleChangeLevelFromResult}
                  myRecordLabel={null}
                  newRecord={duelNewRecord}
                  newRecordLabel={t("newRecord")}
                  registerDirectionHandler={registerDirectionHandler}
                />
              ) : null}
            </div>
          </>
        )}

        {showControls ? (
          <div className={styles.mobileControls}>
            {(
              [
                ["up", "↑", styles.controlUp, t("dirUp")],
                ["left", "←", styles.controlLeft, t("dirLeft")],
                ["right", "→", styles.controlRight, t("dirRight")],
                ["down", "↓", styles.controlDown, t("dirDown")],
              ] as const
            ).map(([dir, glyph, cls, label]) => (
              <button
                key={dir}
                type="button"
                aria-label={label}
                className={`${styles.controlButton} ${cls}`}
                onPointerDown={(event) => {
                  event.preventDefault();
                  pressControl(dir);
                }}
              >
                {glyph}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

// Розміри класичного поля (для зовнішніх споживачів / тестів).
export const SNAKE_CLASSIC_WORLD = {
  w: CLASSIC_BOARD_CELLS_X * CELL_SIZE,
  h: CLASSIC_BOARD_CELLS_Y * CELL_SIZE,
};
