"use client";

import { useEffect, useRef, type MutableRefObject } from "react";
import { findLabelSpot } from "./snakeLabel";
import { isOppositeDir, type Dir } from "./snakeTypes";
import styles from "./SnakeMiniGame.module.scss";

export type SnakeRuntimeState = {
  headX: number;
  headY: number;
  foodX: number;
  foodY: number;
  body: Array<{ x: number; y: number }>;
  score: number;
  alive: boolean;
  emittedAt?: number;
};

export const CLASSIC_BOARD_CELLS_X = 24;
export const CLASSIC_BOARD_CELLS_Y = 16;
export const CELL_SIZE = 18;
export const WORLD_W = CLASSIC_BOARD_CELLS_X * CELL_SIZE;
export const WORLD_H = CLASSIC_BOARD_CELLS_Y * CELL_SIZE;
const TICK_MS = 145;

type Props = {
  /** Змінюється при кожному новому запуску: перезапускає партію. */
  runId: number;
  running: boolean;
  /** Бажаний напрямок: пишуть клавіатура, свайпи й кнопки. */
  directionRef: MutableRefObject<Dir>;
  peerState: SnakeRuntimeState | null;
  peerName: string;
  onScoreChange: (score: number) => void;
  onStateChange?: (state: SnakeRuntimeState) => void;
  onGameOver: (score: number) => void;
  canvasRef: MutableRefObject<HTMLCanvasElement | null>;
};

function randomFood(exclude: Array<{ x: number; y: number }>) {
  const occupied = new Set(exclude.map((point) => `${point.x}:${point.y}`));
  const freeCells: Array<{ x: number; y: number }> = [];
  for (let x = 0; x < CLASSIC_BOARD_CELLS_X; x += 1) {
    for (let y = 0; y < CLASSIC_BOARD_CELLS_Y; y += 1) {
      if (!occupied.has(`${x}:${y}`)) freeCells.push({ x, y });
    }
  }
  if (freeCells.length === 0) return { x: 0, y: 0 };
  return freeCells[Math.floor(Math.random() * freeCells.length)];
}

/** Рівень 1 «Класика»: гра, як і раніше, рахується локально; суперник — «привид» поверх поля. */
export default function SnakeClassicBoard({
  runId,
  running,
  directionRef,
  peerState,
  peerName,
  onScoreChange,
  onStateChange,
  onGameOver,
  canvasRef,
}: Props) {
  const peerStateRef = useRef(peerState);
  const peerNameRef = useRef(peerName);
  const callbacksRef = useRef({ onScoreChange, onStateChange, onGameOver });

  useEffect(() => {
    peerStateRef.current = peerState;
    peerNameRef.current = peerName;
    callbacksRef.current = { onScoreChange, onStateChange, onGameOver };
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!running || !canvas || !ctx) return;

    let alive = true;
    let score = 0;
    let lastTick = 0;
    let frame: number | null = null;
    let currentDir: Dir = "right";
    directionRef.current = "right";

    const midY = Math.floor(CLASSIC_BOARD_CELLS_Y / 2);
    const midX = Math.floor(CLASSIC_BOARD_CELLS_X / 2);
    let snake: Array<{ x: number; y: number }> = [
      { x: midX, y: midY },
      { x: midX - 1, y: midY },
      { x: midX - 2, y: midY },
    ];
    let food = randomFood(snake);

    const drawCell = (x: number, y: number, fillStyle: string, radius = 4) => {
      ctx.fillStyle = fillStyle;
      ctx.beginPath();
      ctx.roundRect(x * CELL_SIZE + 1, y * CELL_SIZE + 1, CELL_SIZE - 2, CELL_SIZE - 2, radius);
      ctx.fill();
    };

    const draw = () => {
      ctx.clearRect(0, 0, WORLD_W, WORLD_H);
      const bg = ctx.createLinearGradient(0, 0, 0, WORLD_H);
      bg.addColorStop(0, "#1b1713");
      bg.addColorStop(1, "#10100f");
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, WORLD_W, WORLD_H);

      ctx.strokeStyle = "rgba(212,177,89,0.09)";
      ctx.beginPath();
      for (let x = 0; x <= WORLD_W; x += CELL_SIZE) {
        ctx.moveTo(x, 0);
        ctx.lineTo(x, WORLD_H);
      }
      for (let y = 0; y <= WORLD_H; y += CELL_SIZE) {
        ctx.moveTo(0, y);
        ctx.lineTo(WORLD_W, y);
      }
      ctx.stroke();

      drawCell(food.x, food.y, "#f2ca58", 5);

      const peer = peerStateRef.current;
      const occupied = new Set<string>([`${food.x}:${food.y}`]);
      for (const point of snake) occupied.add(`${point.x}:${point.y}`);

      if (peer?.alive) {
        for (const point of peer.body ?? []) {
          drawCell(point.x, point.y, "rgba(106, 196, 255, 0.72)", 4);
          occupied.add(`${point.x}:${point.y}`);
        }
        drawCell(peer.headX, peer.headY, "rgba(169, 224, 255, 0.95)", 5);
        drawLabel(peerNameRef.current, peer.headX, peer.headY, occupied);
      }

      for (let i = snake.length - 1; i >= 0; i -= 1) {
        drawCell(snake[i].x, snake[i].y, i === 0 ? "#efe4cd" : "#c8b083", i === 0 ? 5 : 4);
      }
    };

    /** Підпис суперника — на плашці в місці, де він не накриває жодної клітинки змійок. */
    const drawLabel = (text: string, headX: number, headY: number, occupied: Set<string>) => {
      ctx.font = "600 10px Inter, sans-serif";
      const label = { w: Math.ceil(ctx.measureText(text).width) + 8, h: 14 };
      const spot = findLabelSpot({
        head: { x: headX, y: headY },
        label,
        cell: CELL_SIZE,
        board: { w: CLASSIC_BOARD_CELLS_X, h: CLASSIC_BOARD_CELLS_Y },
        occupied,
      });
      ctx.fillStyle = "rgba(12, 14, 20, 0.78)";
      ctx.beginPath();
      ctx.roundRect(spot.x, spot.y, spot.w, spot.h, 4);
      ctx.fill();
      ctx.fillStyle = "rgba(169, 224, 255, 0.98)";
      ctx.textBaseline = "middle";
      ctx.fillText(text, spot.x + 4, spot.y + spot.h / 2 + 0.5);
      ctx.textBaseline = "alphabetic";
    };

    const emitState = () => {
      const head = snake[0];
      callbacksRef.current.onStateChange?.({
        headX: head.x,
        headY: head.y,
        foodX: food.x,
        foodY: food.y,
        body: snake,
        score,
        alive,
      });
    };

    const tick = () => {
      if (!alive) return;
      if (!isOppositeDir(directionRef.current, currentDir)) currentDir = directionRef.current;

      const head = snake[0];
      const next = { x: head.x, y: head.y };
      if (currentDir === "up") next.y -= 1;
      if (currentDir === "down") next.y += 1;
      if (currentDir === "left") next.x -= 1;
      if (currentDir === "right") next.x += 1;

      const outOfBounds =
        next.x < 0 || next.y < 0 || next.x >= CLASSIC_BOARD_CELLS_X || next.y >= CLASSIC_BOARD_CELLS_Y;
      const hitSelf = snake.some((point) => point.x === next.x && point.y === next.y);
      if (outOfBounds || hitSelf) {
        alive = false;
        emitState();
        draw();
        callbacksRef.current.onGameOver(score);
        return;
      }

      const nextSnake = [next, ...snake];
      if (next.x === food.x && next.y === food.y) {
        score += 1;
        callbacksRef.current.onScoreChange(score);
        food = randomFood(nextSnake);
      } else {
        nextSnake.pop();
      }
      snake = nextSnake;
      emitState();
      draw();
    };

    const loop = (ts: number) => {
      if (!alive) {
        frame = null;
        return;
      }
      if (lastTick === 0) {
        lastTick = ts;
        draw();
      }
      if (ts - lastTick >= TICK_MS) {
        lastTick = ts;
        tick();
      }
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);

    return () => {
      if (frame !== null) cancelAnimationFrame(frame);
    };
    // runId: новий запуск = нова партія
  }, [running, runId, canvasRef, directionRef]);

  return (
    <canvas
      ref={canvasRef}
      className={styles.canvas}
      width={WORLD_W}
      height={WORLD_H}
    />
  );
}
