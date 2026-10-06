"use client";

import { useCallback, useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { interpolateBody, type Cell } from "./snakeInterp";
import { findLabelSpot } from "./snakeLabel";
import { useKeyboardDirection, useSwipeDirection } from "./useSnakeControls";
import { isOppositeDir, type Dir, type DuelSnapshot, type SnakeSessionState } from "./snakeTypes";
import styles from "./SnakeMiniGame.module.scss";

const CELL = 18;

type Props = {
  session: SnakeSessionState;
  myId: string;
  peerId: string;
  peerName: string;
  /** Напрямок, який бачить сервер (і який малюємо одразу, до відповіді сервера). */
  onDirection: (dir: Dir) => void;
  onRematch: () => void;
  onChangeLevel: () => void;
  myRecordLabel: string | null;
  /** Реєстр кнопок-стрілок знизу керує напрямком через цей самий обробник. */
  registerDirectionHandler: (handler: ((dir: Dir) => void) | null) => void;
};

type Tracked = {
  prev: DuelSnapshot | null;
  cur: DuelSnapshot | null;
  receivedAt: number;
};

/** Рівень 2 «Дуель»: малює стан із сервера з інтерполяцією між тіками; своє направлення показує одразу. */
export default function SnakeDuelBoard({
  session,
  myId,
  peerId,
  peerName,
  onDirection,
  onRematch,
  onChangeLevel,
  myRecordLabel,
  registerDirectionHandler,
}: Props) {
  const t = useTranslations("snake");
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const trackedRef = useRef<Tracked>({ prev: null, cur: null, receivedAt: 0 });
  const sessionRef = useRef(session);
  const predictedRef = useRef<Dir | null>(null);
  const lastInputAtRef = useRef(0);
  const peerNameRef = useRef(peerName);
  const reducedMotionRef = useRef(false);

  useEffect(() => {
    sessionRef.current = session;
    peerNameRef.current = peerName;
  });

  useEffect(() => {
    reducedMotionRef.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }, []);

  // Нова серверна картинка: попередня стає «від», нова — «до».
  useEffect(() => {
    const next = session.duel;
    const tracked = trackedRef.current;
    if (!next) {
      trackedRef.current = { prev: null, cur: null, receivedAt: performance.now() };
      return;
    }
    const continuing = tracked.cur !== null && next.tick >= tracked.cur.tick;
    if (tracked.cur && continuing && next.tick === tracked.cur.tick) return; // той самий тік (напр., зміна відліку)
    trackedRef.current = {
      prev: continuing ? tracked.cur : null,
      cur: next,
      receivedAt: performance.now(),
    };
    // Новий матч або відродження: сервер веде змійку у новому напрямку — прогноз скидаємо.
    const respawned = tracked.cur?.snakes[myId]?.alive === false && next.snakes[myId]?.alive === true;
    if (!continuing || next.tick === 0 || respawned) {
      predictedRef.current = next.snakes[myId]?.dir ?? null;
    }
  }, [session.duel, myId]);

  const handleDirection = useCallback(
    (dir: Dir) => {
      const phase = sessionRef.current.phase;
      if (phase !== "playing" && phase !== "countdown") return;
      const serverDir = sessionRef.current.duel?.snakes[myId]?.dir;
      const reference = predictedRef.current ?? serverDir ?? null;
      if (reference && (dir === reference || isOppositeDir(dir, reference))) return;
      predictedRef.current = dir; // показываем сразу, не дожидаясь сервера
      lastInputAtRef.current = performance.now();
      onDirection(dir);
    },
    [myId, onDirection],
  );

  useEffect(() => {
    registerDirectionHandler(handleDirection);
    return () => registerDirectionHandler(null);
  }, [handleDirection, registerDirectionHandler]);

  const active = session.phase === "playing" || session.phase === "countdown";
  useKeyboardDirection(active, handleDirection);
  useSwipeDirection(canvasRef, active, handleDirection);

  // ── відмальовка ──
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    let frame = 0;

    const cell = (x: number, y: number, fill: string, radius = 4, inset = 1) => {
      ctx.fillStyle = fill;
      ctx.beginPath();
      ctx.roundRect(x * CELL + inset, y * CELL + inset, CELL - inset * 2, CELL - inset * 2, radius);
      ctx.fill();
    };

    const eye = (x: number, y: number, dir: Dir, color: string) => {
      // Маленький «носик» у напрямку руху: одразу показує обраний (передбачений) поворот.
      const cx = x * CELL + CELL / 2;
      const cy = y * CELL + CELL / 2;
      const dx = dir === "left" ? -1 : dir === "right" ? 1 : 0;
      const dy = dir === "up" ? -1 : dir === "down" ? 1 : 0;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(cx + dx * 4, cy + dy * 4, 2.2, 0, Math.PI * 2);
      ctx.fill();
    };

    const render = (now: number) => {
      frame = requestAnimationFrame(render);
      const s = sessionRef.current;
      const { prev, cur, receivedAt } = trackedRef.current;
      const board = cur?.board ?? s.duel?.board ?? { w: 24, h: 16 };
      const w = board.w * CELL;
      const h = board.h * CELL;
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }

      const bg = ctx.createLinearGradient(0, 0, 0, h);
      bg.addColorStop(0, "#181a22");
      bg.addColorStop(1, "#0e0f14");
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = "rgba(150,170,220,0.08)";
      ctx.beginPath();
      for (let x = 0; x <= w; x += CELL) {
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
      }
      for (let y = 0; y <= h; y += CELL) {
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
      }
      ctx.stroke();
      if (!cur) return;

      for (const o of cur.obstacles) cell(o.x, o.y, "#3a3f52", 3);

      // Їжа: помітна, з легкою пульсацією (при reduced motion — без пульсації).
      const pulse = reducedMotionRef.current ? 0 : Math.sin(now / 240);
      const fx = cur.food.x * CELL + CELL / 2;
      const fy = cur.food.y * CELL + CELL / 2;
      const glow = ctx.createRadialGradient(fx, fy, 2, fx, fy, CELL * (1.05 + pulse * 0.12));
      glow.addColorStop(0, "rgba(255, 214, 90, 0.55)");
      glow.addColorStop(1, "rgba(255, 214, 90, 0)");
      ctx.fillStyle = glow;
      ctx.fillRect(fx - CELL * 1.3, fy - CELL * 1.3, CELL * 2.6, CELL * 2.6);
      const r = CELL * (0.34 + pulse * 0.05);
      ctx.fillStyle = "#ffd75a";
      ctx.beginPath();
      ctx.arc(fx, fy, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#fff3b8";
      ctx.lineWidth = 1.5;
      ctx.stroke();

      const t01 =
        s.phase === "playing" && prev ? (now - receivedAt) / Math.max(40, cur.tickMs) : 1;
      const winnerId = s.phase === "matchEnd" ? s.matchWinner : null;

      const occupied = new Set<string>([`${cur.food.x}:${cur.food.y}`]);
      for (const o of cur.obstacles) occupied.add(`${o.x}:${o.y}`);
      const drawn: Record<string, Cell[]> = {};

      for (const id of [peerId, myId]) {
        const snake = cur.snakes[id];
        if (!snake) continue;
        const mine = id === myId;
        // Інтерполюємо лише між двома «живими» кадрами: після відродження змійка з'являється на новому місці.
        const prevSnake = prev?.snakes[id];
        const prevBody = prevSnake?.alive ? prevSnake.body : null;
        const body = snake.alive ? interpolateBody(prevBody, snake.body, t01) : snake.body;
        drawn[id] = body;
        for (const c of snake.body) occupied.add(`${c.x}:${c.y}`);

        const dead = !snake.alive;
        ctx.globalAlpha = dead ? 0.45 : 1;
        const bodyColor = mine ? "#c8b083" : "rgba(106, 196, 255, 0.78)";
        const headColor = mine ? "#efe4cd" : "rgba(169, 224, 255, 0.98)";
        for (let i = body.length - 1; i >= 0; i -= 1) {
          cell(body[i].x, body[i].y, i === 0 ? headColor : bodyColor, i === 0 ? 5 : 4);
        }
        ctx.globalAlpha = 1;

        const head = body[0];
        if (!dead) {
          eye(head.x, head.y, mine ? (predictedRef.current ?? snake.dir) : snake.dir, "#1a1408");
        }

        // Підсвітка переможця матчу.
        if (winnerId === id) {
          const wob = reducedMotionRef.current ? 0.8 : 0.55 + 0.45 * Math.sin(now / 130);
          ctx.strokeStyle = `rgba(255, 233, 140, ${wob})`;
          ctx.lineWidth = 2.5;
          for (const c of body) {
            ctx.beginPath();
            ctx.roundRect(c.x * CELL, c.y * CELL, CELL, CELL, 5);
            ctx.stroke();
          }
        }
      }

      // Підпис суперника — на плашці поза клітинками змійок.
      const peerSnake = cur.snakes[peerId];
      if (peerSnake?.body.length) {
        ctx.font = "600 10px Inter, sans-serif";
        const text = peerNameRef.current;
        const label = { w: Math.ceil(ctx.measureText(text).width) + 8, h: 14 };
        const head = (drawn[peerId] ?? peerSnake.body)[0];
        const spot = findLabelSpot({
          head: { x: Math.round(head.x), y: Math.round(head.y) },
          label,
          cell: CELL,
          board,
          occupied,
        });
        ctx.fillStyle = "rgba(10, 14, 24, 0.8)";
        ctx.beginPath();
        ctx.roundRect(spot.x, spot.y, spot.w, spot.h, 4);
        ctx.fill();
        ctx.fillStyle = "rgba(169, 224, 255, 0.98)";
        ctx.textBaseline = "middle";
        ctx.fillText(text, spot.x + 4, spot.y + spot.h / 2 + 0.5);
        ctx.textBaseline = "alphabetic";
      }
    };

    frame = requestAnimationFrame(render);
    return () => cancelAnimationFrame(frame);
  }, [myId, peerId]);

  // Серверний напрямок має пріоритет, коли ми давно не натискали (на випадок відкинутого сервером натискання).
  useEffect(() => {
    const serverDir = session.duel?.snakes[myId]?.dir;
    if (!serverDir) return;
    const tickMs = session.duel?.tickMs ?? 110;
    if (performance.now() - lastInputAtRef.current > tickMs * 2 + 150) {
      predictedRef.current = serverDir;
    }
  }, [session.duel, myId]);

  const iWonMatch = session.matchWinner === myId;
  const graceSec = Math.ceil(session.graceMs / 1000);
  const pausedForPeer = session.pausedFor === peerId;
  const target = session.duel?.targetScore ?? 30;
  const myScore = session.scores[myId] ?? 0;
  const peerScore = session.scores[peerId] ?? 0;
  const mySnake = session.duel?.snakes[myId];
  const respawnSec = mySnake && !mySnake.alive ? Math.max(1, Math.ceil(mySnake.respawnInMs / 1000)) : 0;

  return (
    <>
      <canvas ref={canvasRef} className={styles.canvas} width={24 * CELL} height={16 * CELL} />

      {session.phase === "countdown" && session.countdown ? (
        <div className={styles.boardOverlay} aria-live="assertive">
          <span key={session.countdown} className={styles.countdown}>
            {session.countdown}
          </span>
          <span className={styles.overlaySub}>{t("raceTo", { n: target })}</span>
        </div>
      ) : null}

      {session.phase === "playing" && respawnSec > 0 ? (
        <div className={`${styles.boardOverlay} ${styles.boardOverlayLight}`} aria-live="polite">
          <span className={styles.overlayTitle}>{t("respawnIn", { s: respawnSec })}</span>
        </div>
      ) : null}

      {session.phase === "paused" ? (
        <div className={styles.boardOverlay} aria-live="polite">
          <span className={styles.overlayTitle}>
            {pausedForPeer ? t("peerDisconnected", { name: peerName }) : t("youDisconnected")}
          </span>
          <span className={styles.overlaySub}>{t("waitingSeconds", { s: graceSec })}</span>
        </div>
      ) : null}

      {session.phase === "matchEnd" ? (
        <div className={styles.boardOverlay} aria-live="polite">
          <span className={styles.overlayTitle}>
            {iWonMatch ? t("matchWin") : t("matchLose", { name: peerName })}
          </span>
          <span className={styles.overlaySub}>
            {session.endReason === "disconnect"
              ? iWonMatch
                ? t("winByDisconnect", { name: peerName })
                : t("lossByDisconnect")
              : t("finalScore", { me: myScore, peer: peerScore, name: peerName, n: target })}
          </span>
          {myRecordLabel ? <span className={styles.overlaySub}>{myRecordLabel}</span> : null}
          <div className={styles.overlayActions}>
            <button type="button" className={styles.startButton} onClick={onRematch}>
              {t("playAgain")}
            </button>
            <button type="button" className={styles.secondaryButton} onClick={onChangeLevel}>
              {t("changeLevel")}
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
