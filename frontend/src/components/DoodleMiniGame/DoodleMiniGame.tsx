"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import styles from "./DoodleMiniGame.module.scss";

type Platform = {
  x: number;
  y: number;
  w: number;
  kind: "solid" | "breakable";
  /** Сколько раз на хрупкую платформу уже приземлились: 1 — треснула, 2 — сломана. */
  hits: number;
  broken: boolean;
  fallSpeed: number;
  /** Кадры покачивания после первого приземления (затухает до 0). */
  wobble: number;
  /** Кадры с момента разлома — для анимации разлетающихся половинок. */
  breakT: number;
  /** Кадр последнего засчитанного приземления — защита от двойного срабатывания. */
  lastHitFrame: number;
};

export type DoodleRuntimeState = {
  x: number;
  y: number;
  cameraY: number;
  score: number;
  alive: boolean;
  emittedAt?: number;
};

type DoodleMiniGameProps = {
  open: boolean;
  myScore: number;
  peerScore: number;
  peerName: string;
  peerState: DoodleRuntimeState | null;
  peerPingMs?: number | null;
  onClose: () => void;
  onScoreChange: (score: number) => void;
  onStateChange?: (state: DoodleRuntimeState) => void;
};

const WORLD_W = 320;
const WORLD_H = 480;
const PLAYER_W = 24;
const PLAYER_H = 24;
const MOBILE_GRAVITY = 0.28;
const MOBILE_JUMP_VELOCITY = -8.2;
const DESKTOP_GRAVITY = 0.22;
const DESKTOP_JUMP_VELOCITY = -6.9;
const MOVE_SPEED = 3.8;
const BREAKABLE_SCORE_THRESHOLD = 1000;
const BREAKABLE_PLATFORM_CHANCE = 0.3;
/** С какого приземления хрупкая платформа ломается. */
const BREAKABLE_HITS_TO_BREAK = 2;
const CRACK_WOBBLE_FRAMES = 18;
/** Минимум кадров между двумя засчитанными приземлениями на одну платформу. */
const HIT_COOLDOWN_FRAMES = 8;

export default function DoodleMiniGame({
  open,
  myScore,
  peerScore,
  peerName,
  peerState,
  peerPingMs,
  onClose,
  onScoreChange,
  onStateChange,
}: DoodleMiniGameProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const frameRef = useRef<number | null>(null);
  const keyLeftRef = useRef(false);
  const keyRightRef = useRef(false);
  const touchXRef = useRef<number | null>(null);
  const peerStateRef = useRef<DoodleRuntimeState | null>(peerState);
  const peerNameRef = useRef(peerName);

  const [bestScore, setBestScore] = useState(0);
  const [isStarted, setIsStarted] = useState(false);
  const [isGameOver, setIsGameOver] = useState(false);

  const setMoveDirection = (direction: "left" | "right" | null) => {
    keyLeftRef.current = direction === "left";
    keyRightRef.current = direction === "right";
  };

  const isMyWinner = useMemo(() => myScore > peerScore, [myScore, peerScore]);
  const isPeerWinner = useMemo(() => peerScore > myScore, [myScore, peerScore]);
  const isDesktop = useMemo(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia("(min-width: 1024px) and (pointer: fine)").matches;
  }, []);
  const gravity = isDesktop ? DESKTOP_GRAVITY : MOBILE_GRAVITY;
  const jumpVelocity = isDesktop ? DESKTOP_JUMP_VELOCITY : MOBILE_JUMP_VELOCITY;

  useEffect(() => {
    peerStateRef.current = peerState;
  }, [peerState]);

  useEffect(() => {
    peerNameRef.current = peerName;
  }, [peerName]);

  useEffect(() => {
    if (!open) {
      setIsStarted(false);
      setIsGameOver(false);
      setMoveDirection(null);
      return;
    }
    setIsStarted(false);
    setIsGameOver(false);
  }, [open]);

  useEffect(() => {
    if (!open || !isStarted) {
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
      return;
    }

    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) {
      return;
    }

    let alive = true;
    let cameraY = 0;
    let score = 0;
    let frame = 0;

    const player = {
      x: WORLD_W / 2 - PLAYER_W / 2,
      y: WORLD_H - 70,
      vx: 0,
      vy: 0,
    };

    const ghost = {
      x: 0,
      y: 0,
      cameraY: 0,
      alive: false,
      initialized: false,
    };

    const platforms: Platform[] = [];
    const basePlatformY = player.y + PLAYER_H + 4;
    platforms.push({
      x: Math.max(0, Math.min(WORLD_W - 86, player.x - 28)),
      y: basePlatformY,
      w: 86,
      kind: "solid",
      hits: 0,
      broken: false,
      fallSpeed: 0,
      wobble: 0,
      breakT: 0,
      lastHitFrame: -Infinity,
    });
    for (let i = 1; i < 9; i += 1) {
      platforms.push({
        x: Math.random() * (WORLD_W - 72),
        y: basePlatformY - i * 64,
        w: 72,
        kind: "solid",
        hits: 0,
        broken: false,
        fallSpeed: 0,
        wobble: 0,
        breakT: 0,
        lastHitFrame: -Infinity,
      });
    }

    const drawRoundedRect = (
      x: number,
      y: number,
      w: number,
      h: number,
      r: number,
    ) => {
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.lineTo(x + w - r, y);
      ctx.quadraticCurveTo(x + w, y, x + w, y + r);
      ctx.lineTo(x + w, y + h - r);
      ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
      ctx.lineTo(x + r, y + h);
      ctx.quadraticCurveTo(x, y + h, x, y + h - r);
      ctx.lineTo(x, y + r);
      ctx.quadraticCurveTo(x, y, x + r, y);
      ctx.closePath();
    };

    const draw = () => {
      ctx.clearRect(0, 0, WORLD_W, WORLD_H);

      const bg = ctx.createLinearGradient(0, 0, 0, WORLD_H);
      bg.addColorStop(0, "#2f2a22");
      bg.addColorStop(1, "#1c1914");
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, WORLD_W, WORLD_H);

      ctx.strokeStyle = "rgba(220,184,103,0.12)";
      for (let y = 0; y < WORLD_H; y += 24) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(WORLD_W, y);
        ctx.stroke();
      }

      for (const platform of platforms) {
        const py = platform.y - cameraY;
        if (py < -20 || py > WORLD_H + 20) continue;

        if (platform.broken) {
          // Две половинки разлетаются в стороны, вращаются и тускнеют, падая вниз.
          const t = platform.breakT;
          ctx.save();
          ctx.globalAlpha = Math.max(0, 1 - t / 60);
          ctx.fillStyle = "#ba9550";
          ctx.save();
          ctx.translate(platform.x + platform.w * 0.3 - t * 0.7, py + 5);
          ctx.rotate(-0.22 - t * 0.035);
          ctx.fillRect(-platform.w * 0.26, -3, platform.w * 0.5, 6);
          ctx.restore();

          ctx.save();
          ctx.translate(platform.x + platform.w * 0.72 + t * 0.7, py + 7);
          ctx.rotate(0.28 + t * 0.04);
          ctx.fillRect(-platform.w * 0.22, -3, platform.w * 0.46, 6);
          ctx.restore();
          ctx.restore();
          continue;
        }

        // Треснувшая платформа коротко покачивается после первого приземления.
        const cracked = platform.kind === "breakable" && platform.hits > 0;
        const wobbleX =
          platform.wobble > 0
            ? Math.sin(platform.wobble * 1.3) * platform.wobble * 0.12
            : 0;
        ctx.save();
        ctx.translate(wobbleX, 0);

        // Платформа-овечка: ушки + мягкая "шерстяная" подушка.
        ctx.fillStyle = "#d9b889";
        ctx.beginPath();
        ctx.ellipse(platform.x + 8, py + 7, 6, 4, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(
          platform.x + platform.w - 8,
          py + 7,
          6,
          4,
          0,
          0,
          Math.PI * 2,
        );
        ctx.fill();

        drawRoundedRect(platform.x, py + 2, platform.w, 10, 5);
        ctx.fillStyle = cracked
          ? "#dcae6c"
          : platform.kind === "breakable"
            ? "#f0c98b"
            : "#f3ecd9";
        ctx.fill();

        ctx.strokeStyle = cracked
          ? "#9e5f2e"
          : platform.kind === "breakable"
            ? "#c7864f"
            : "#d4b159";
        ctx.lineWidth = 1;
        ctx.stroke();

        // Мордочка овечки
        const cx = platform.x + platform.w / 2;
        ctx.fillStyle = "rgba(110, 80, 44, 0.82)";
        ctx.beginPath();
        ctx.arc(cx - 5, py + 7, 1.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(cx + 5, py + 7, 1.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "rgba(110, 80, 44, 0.82)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(cx, py + 9, 2.4, 0.1, Math.PI - 0.1);
        ctx.stroke();

        if (platform.kind === "breakable") {
          // Трещины на ломающихся платформах после 1000 очков.
          ctx.strokeStyle = "rgba(120, 72, 34, 0.55)";
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(platform.x + platform.w * 0.42, py + 3);
          ctx.lineTo(platform.x + platform.w * 0.52, py + 11);
          ctx.lineTo(platform.x + platform.w * 0.61, py + 5);
          ctx.stroke();
        }

        if (cracked) {
          // После первого приземления: глубокая трещина через всю платформу — второй раз не выдержит.
          ctx.strokeStyle = "rgba(92, 48, 18, 0.9)";
          ctx.lineWidth = 1.6;
          ctx.beginPath();
          ctx.moveTo(platform.x + platform.w * 0.5, py + 2);
          ctx.lineTo(platform.x + platform.w * 0.45, py + 6);
          ctx.lineTo(platform.x + platform.w * 0.55, py + 8);
          ctx.lineTo(platform.x + platform.w * 0.48, py + 12);
          ctx.moveTo(platform.x + platform.w * 0.45, py + 6);
          ctx.lineTo(platform.x + platform.w * 0.3, py + 4);
          ctx.moveTo(platform.x + platform.w * 0.55, py + 8);
          ctx.lineTo(platform.x + platform.w * 0.72, py + 10);
          ctx.stroke();
        }
        ctx.restore();
      }

      const peerY = ghost.initialized
        ? ghost.y - (ghost.cameraY - cameraY)
        : null;
      const canDrawPeer =
        ghost.initialized &&
        ghost.alive &&
        peerY != null &&
        peerY > -PLAYER_H - 8 &&
        peerY < WORLD_H + PLAYER_H + 8;

      if (canDrawPeer && peerY != null) {
        ctx.fillStyle = "rgba(100, 195, 255, 0.85)";
        ctx.fillRect(ghost.x, peerY, PLAYER_W, PLAYER_H);
      }

      ctx.fillStyle = "#f0e6d0";
      ctx.fillRect(player.x, player.y - cameraY, PLAYER_W, PLAYER_H);

      if (canDrawPeer && peerY != null) {
        ctx.fillStyle = "rgba(163, 222, 255, 0.95)";
        ctx.font = "600 10px Inter, sans-serif";
        ctx.fillText(
          peerNameRef.current,
          Math.max(4, ghost.x - 2),
          Math.max(10, peerY - 6),
        );
      }
    };

    const update = () => {
      if (!alive) return;
      frame += 1;

      const targetPeer = peerStateRef.current;
      if (targetPeer) {
        if (!ghost.initialized) {
          ghost.x = targetPeer.x;
          ghost.y = targetPeer.y;
          ghost.cameraY = targetPeer.cameraY;
          ghost.alive = targetPeer.alive;
          ghost.initialized = true;
        } else {
          ghost.x += (targetPeer.x - ghost.x) * 0.18;
          ghost.y += (targetPeer.y - ghost.y) * 0.18;
          ghost.cameraY += (targetPeer.cameraY - ghost.cameraY) * 0.18;
          ghost.alive = targetPeer.alive;
        }
      } else {
        ghost.initialized = false;
      }

      if (keyLeftRef.current) player.vx = -MOVE_SPEED;
      else if (keyRightRef.current) player.vx = MOVE_SPEED;
      else player.vx *= 0.84;

      player.x += player.vx;
      if (player.x < -PLAYER_W) player.x = WORLD_W;
      if (player.x > WORLD_W) player.x = -PLAYER_W;

      player.vy += gravity;
      const prevY = player.y;
      player.y += player.vy;

      if (player.vy > 0) {
        for (const p of platforms) {
          if (p.broken) {
            continue;
          }
          const playerBottomPrev = prevY + PLAYER_H;
          const playerBottomNext = player.y + PLAYER_H;
          const platformTop = p.y;
          const intersectsX = player.x + PLAYER_W > p.x && player.x < p.x + p.w;
          const crossedTop =
            playerBottomPrev <= platformTop && playerBottomNext >= platformTop;
          if (intersectsX && crossedTop) {
            // Одно приземление засчитывается один раз: повторное касание в пределах нескольких кадров игнорируем.
            if (frame - p.lastHitFrame < HIT_COOLDOWN_FRAMES) {
              continue;
            }
            p.lastHitFrame = frame;

            const isFragile =
              p.kind === "breakable" && score >= BREAKABLE_SCORE_THRESHOLD;
            if (isFragile) p.hits += 1;

            if (isFragile && p.hits >= BREAKABLE_HITS_TO_BREAK) {
              // Второе приземление: платформа ломается, игрок проваливается сквозь неё.
              p.broken = true;
              p.fallSpeed = 2.2;
              p.breakT = 0;
            } else {
              // Обычный отскок; хрупкая после первого раза трескается и покачивается.
              if (isFragile) p.wobble = CRACK_WOBBLE_FRAMES;
              player.y = p.y - PLAYER_H;
              player.vy = jumpVelocity;
            }
            break;
          }
        }
      }

      for (const p of platforms) {
        if (p.wobble > 0) p.wobble -= 1;
        if (!p.broken) {
          continue;
        }
        p.y += p.fallSpeed;
        p.fallSpeed += 0.22;
        p.breakT += 1;
      }

      if (player.y - cameraY < WORLD_H * 0.35) {
        cameraY = player.y - WORLD_H * 0.35;
      }

      for (const p of platforms) {
        if (p.y - cameraY > WORLD_H + 24) {
          p.y -= WORLD_H + 90;
          p.x = Math.random() * (WORLD_W - p.w);
          const canBreak =
            p.w <= 72 &&
            score >= BREAKABLE_SCORE_THRESHOLD &&
            Math.random() < BREAKABLE_PLATFORM_CHANCE;
          p.kind = canBreak ? "breakable" : "solid";
          // Платформа переиспользуется — полностью сбрасываем трещины и разлом.
          p.hits = 0;
          p.broken = false;
          p.fallSpeed = 0;
          p.wobble = 0;
          p.breakT = 0;
          p.lastHitFrame = -Infinity;
        }
      }

      const nextScore = Math.max(0, Math.floor(-cameraY));
      if (nextScore !== score) {
        score = nextScore;
        onScoreChange(score);
      }
      onStateChange?.({
        x: player.x,
        y: player.y,
        cameraY,
        score,
        alive,
      });
      setBestScore((prev) => (score > prev ? score : prev));

      if (player.y - cameraY > WORLD_H + 40) {
        alive = false;
        setIsGameOver(true);
        setIsStarted(false);
        onStateChange?.({
          x: player.x,
          y: player.y,
          cameraY,
          score,
          alive: false,
        });
      }

      draw();

      if (!alive) {
        ctx.fillStyle = "rgba(0,0,0,0.62)";
        ctx.fillRect(0, 0, WORLD_W, WORLD_H);
        ctx.fillStyle = "#fff1cf";
        ctx.font = "700 20px Inter, sans-serif";
        ctx.fillText("Игра окончена", 84, 208);
        ctx.font = "600 14px Inter, sans-serif";
        ctx.fillText(`Очки: ${score}`, 126, 238);
        return;
      }

      frameRef.current = requestAnimationFrame(update);
    };

    frameRef.current = requestAnimationFrame(update);

    return () => {
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
    };
  }, [gravity, isStarted, jumpVelocity, onScoreChange, onStateChange, open]);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft" || event.key.toLowerCase() === "a") {
        keyLeftRef.current = true;
      }
      if (event.key === "ArrowRight" || event.key.toLowerCase() === "d") {
        keyRightRef.current = true;
      }
    };

    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft" || event.key.toLowerCase() === "a") {
        keyLeftRef.current = false;
      }
      if (event.key === "ArrowRight" || event.key.toLowerCase() === "d") {
        keyRightRef.current = false;
      }
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

    return () => {
      keyLeftRef.current = false;
      keyRightRef.current = false;
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div
        className={styles.card}
        role="dialog"
        aria-modal="true"
        aria-label="Doodle"
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.topRow}>
          <p className={styles.title}>Doodle</p>
          <button
            type="button"
            className={styles.close}
            onClick={onClose}
            aria-label="Закрыть"
          >
            ×
          </button>
        </div>
        <p className={styles.scoreLine}>
          Я: {myScore} {isMyWinner ? "👑" : ""} · {peerName}: {peerScore}{" "}
          {isPeerWinner ? "👑" : ""}
        </p>
        <p className={styles.bestLine}>Лучший результат: {bestScore}</p>
        <p className={styles.bestLine}>
          Пинг: {peerPingMs != null ? `${peerPingMs} мс` : "—"}
        </p>
        <p className={styles.hint}>Управление: ← → или свайп</p>
        <div className={styles.canvasWrap}>
          <canvas
            ref={canvasRef}
            className={styles.canvas}
            width={WORLD_W}
            height={WORLD_H}
            onTouchStart={(e) => {
              touchXRef.current = e.touches[0]?.clientX ?? null;
            }}
            onTouchMove={(e) => {
              const start = touchXRef.current;
              const now = e.touches[0]?.clientX;
              if (start == null || now == null) return;
              const delta = now - start;
              setMoveDirection(
                delta < -8 ? "left" : delta > 8 ? "right" : null,
              );
            }}
            onTouchEnd={() => {
              setMoveDirection(null);
              touchXRef.current = null;
            }}
          />
          {!isStarted ? (
            <div className={styles.startOverlay}>
              <button
                type="button"
                className={styles.startButton}
                onClick={() => {
                  onScoreChange(0);
                  setIsGameOver(false);
                  setIsStarted(true);
                }}
              >
                {isGameOver ? "Рестарт" : "Старт"}
              </button>
            </div>
          ) : null}
        </div>
        <div className={styles.mobileControls}>
          <button
            type="button"
            className={styles.controlButton}
            aria-label="Двигаться влево"
            onTouchStart={() => setMoveDirection("left")}
            onTouchEnd={() => setMoveDirection(null)}
            onTouchCancel={() => setMoveDirection(null)}
            onMouseDown={() => setMoveDirection("left")}
            onMouseUp={() => setMoveDirection(null)}
            onMouseLeave={() => setMoveDirection(null)}
          >
            ←
          </button>
          <button
            type="button"
            className={styles.controlButton}
            aria-label="Двигаться вправо"
            onTouchStart={() => setMoveDirection("right")}
            onTouchEnd={() => setMoveDirection(null)}
            onTouchCancel={() => setMoveDirection(null)}
            onMouseDown={() => setMoveDirection("right")}
            onMouseUp={() => setMoveDirection(null)}
            onMouseLeave={() => setMoveDirection(null)}
          >
            →
          </button>
        </div>
      </div>
    </div>
  );
}
