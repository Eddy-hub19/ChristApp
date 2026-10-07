import { buildShapes, isEdgePiece, pieceOutline, tabMargin, type PuzzleShapes } from "./puzzleShape";
import {
  clampCamera,
  fitCamera,
  fitRect,
  screenToWorld,
  stepToward,
  zoomAt,
  type Camera,
} from "./puzzleView";
import type { PuzzleCursorEvent, PuzzleGroup, PuzzleMoveEvent, PuzzleState } from "./puzzleTypes";

export type BoardCallbacks = {
  grab: (group: number) => void;
  move: (group: number, x: number, y: number) => void;
  drop: (group: number, x: number, y: number) => void;
  cursor: (x: number, y: number) => void;
};

export type BoardPlayers = {
  meId: string;
  peerId: string | null;
  meInitial: string;
  peerInitial: string;
  meAvatarUrl?: string | null;
  peerAvatarUrl?: string | null;
};

export type BoardOptions = { showHint: boolean; edgesOnly: boolean; done: boolean };

type RenderGroup = {
  id: number;
  pieces: number[];
  signature: string;
  x: number;
  y: number;
  tx: number;
  ty: number;
  placed: boolean;
  heldBy: string | null;
  order: number;
};

type Drag = {
  groupId: number;
  pointerId: number;
  offX: number;
  offY: number;
  startedAt: number;
  lastSent: number;
  lastGrabAttempt: number;
};

const MY_COLOR = "#3b82f6";
const PEER_COLOR = "#f59e0b";
const SEND_INTERVAL_MS = 66; // ~15 разів на секунду
const CURSOR_INTERVAL_MS = 120;
const CURSOR_TTL_MS = 2500;
const MAX_SPRITE_PX = 640;
const DONE_FADE_MS = 1000;
const CAM_ANIM_MS = 700;

const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

/**
 * Canvas-рушій пазла: малювання спрайтів кусочків, камера (зум/панорама), перетягування, інтерполяція руху
 * партнера й плавна «посадка» кусочків при склейці. Стан гри не зберігає — приймає знімки сервера
 * (`setPuzzle`) і шле на сервер лише наміри (взяв / рухаю / відпустив).
 */
export class PuzzleBoardEngine {
  private ctx: CanvasRenderingContext2D;
  private hitCtx: CanvasRenderingContext2D;
  private dpr = 1;
  private cssW = 0;
  private cssH = 0;

  private puzzle: PuzzleState | null = null;
  private puzzleKey = "";
  private shapes: PuzzleShapes | null = null;
  private outlines: Path2D[] = [];
  private sprites: HTMLCanvasElement[] = [];
  private spriteMargin = 0;
  private image: HTMLImageElement | null = null;

  private groups = new Map<number, RenderGroup>();
  private pieceGroup: number[] = [];
  private pieceSignature: string[] = [];
  private offX: Float32Array = new Float32Array(0);
  private offY: Float32Array = new Float32Array(0);

  private cam: Camera = { scale: 1, x: 0, y: 0 };
  private fit: Camera = { scale: 1, x: 0, y: 0 };
  private userMovedCamera = false;
  private camAnim: { from: Camera; to: Camera; start: number } | null = null;

  private players: BoardPlayers = { meId: "", peerId: null, meInitial: "", peerInitial: "" };
  private avatars = new Map<string, HTMLImageElement>();
  private options: BoardOptions = { showHint: false, edgesOnly: false, done: false };
  private doneAt = 0;

  private drag: Drag | null = null;
  private pointers = new Map<number, { x: number; y: number }>();
  private pan: { lastX: number; lastY: number; pointerId: number } | null = null;
  private pinch: { dist: number; cx: number; cy: number } | null = null;
  private denied: { groupId: number; until: number } | null = null;
  private peerCursor: { x: number; y: number; at: number } | null = null;
  private lastCursorSent = 0;

  private raf = 0;
  private lastFrame = 0;
  private destroyed = false;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly cb: BoardCallbacks,
  ) {
    this.ctx = canvas.getContext("2d")!;
    const hit = document.createElement("canvas");
    hit.width = hit.height = 1;
    this.hitCtx = hit.getContext("2d")!;
    canvas.addEventListener("pointerdown", this.onPointerDown);
    canvas.addEventListener("pointermove", this.onPointerMove);
    canvas.addEventListener("pointerup", this.onPointerUp);
    canvas.addEventListener("pointercancel", this.onPointerUp);
    canvas.addEventListener("wheel", this.onWheel, { passive: false });
    canvas.addEventListener("contextmenu", this.onContextMenu);
  }

  destroy() {
    this.destroyed = true;
    cancelAnimationFrame(this.raf);
    const c = this.canvas;
    c.removeEventListener("pointerdown", this.onPointerDown);
    c.removeEventListener("pointermove", this.onPointerMove);
    c.removeEventListener("pointerup", this.onPointerUp);
    c.removeEventListener("pointercancel", this.onPointerUp);
    c.removeEventListener("wheel", this.onWheel);
    c.removeEventListener("contextmenu", this.onContextMenu);
  }

  // ───────────── вхід ззовні ─────────────

  resize(cssW: number, cssH: number, dpr: number) {
    this.cssW = cssW;
    this.cssH = cssH;
    this.dpr = Math.min(dpr || 1, 2);
    this.canvas.width = Math.max(1, Math.round(cssW * this.dpr));
    this.canvas.height = Math.max(1, Math.round(cssH * this.dpr));
    this.refit();
    this.requestDraw();
  }

  setImage(image: HTMLImageElement) {
    this.image = image;
    this.buildSprites();
    this.requestDraw();
  }

  setPlayers(players: BoardPlayers) {
    this.players = players;
    for (const [id, url] of [
      [players.meId, players.meAvatarUrl],
      [players.peerId, players.peerAvatarUrl],
    ] as const) {
      if (!id || !url || this.avatars.has(id)) continue;
      const img = new Image();
      img.onload = () => this.requestDraw();
      img.src = url;
      this.avatars.set(id, img);
    }
    this.requestDraw();
  }

  setOptions(options: BoardOptions) {
    if (options.done && !this.options.done) {
      this.doneAt = performance.now();
      this.animateCamera(this.boardFit());
    }
    this.options = options;
    this.requestDraw();
  }

  /** Новий знімок сервера: оновлюємо цілі, не ламаючи те, що гравець зараз тягне. */
  setPuzzle(puzzle: PuzzleState) {
    const key = `${puzzle.imageId}:${puzzle.seed}:${puzzle.cols}x${puzzle.rows}:${puzzle.startedAt}`;
    const fresh = key !== this.puzzleKey;
    const now = performance.now();
    this.puzzle = puzzle;
    const total = puzzle.cols * puzzle.rows;

    if (fresh) {
      this.puzzleKey = key;
      this.groups.clear();
      this.pieceGroup = new Array(total).fill(-1);
      this.pieceSignature = new Array(total).fill("");
      this.offX = new Float32Array(total);
      this.offY = new Float32Array(total);
      this.drag = null;
      this.pan = null;
      this.pinch = null;
      this.pointers.clear();
      this.shapes = buildShapes(puzzle.seed, puzzle.cols, puzzle.rows, puzzle.cw, puzzle.ch);
      this.outlines = Array.from({ length: total }, (_, piece) => this.toPath(piece));
      this.userMovedCamera = false;
      this.doneAt = 0;
      this.buildSprites();
      this.refit();
    }

    // Де кусочки зараз намальовані — для плавного переходу, якщо їхня група зміниться (склейка, посадка на місце).
    const previousAbs = new Map<number, { x: number; y: number }>();
    if (!fresh) {
      for (let piece = 0; piece < total; piece += 1) {
        const prev = this.groups.get(this.pieceGroup[piece]);
        if (prev) previousAbs.set(piece, this.pieceOrigin(prev, piece));
      }
    }

    const next = new Map<number, RenderGroup>();
    puzzle.groups.forEach((g: PuzzleGroup, order: number) => {
      const old = this.groups.get(g.id);
      const signature = [...g.pieces].sort((a, b) => a - b).join(",");
      const sameSet = old?.signature === signature;
      const dragged = this.drag?.groupId === g.id && g.heldBy !== this.players.peerId;
      const rg: RenderGroup = {
        id: g.id,
        pieces: g.pieces,
        signature,
        x: g.x,
        y: g.y,
        tx: g.x,
        ty: g.y,
        placed: g.placed,
        heldBy: g.heldBy,
        order,
      };
      if (old && sameSet) {
        rg.x = old.x;
        rg.y = old.y;
        if (dragged) {
          rg.tx = old.tx;
          rg.ty = old.ty;
          rg.heldBy = this.players.meId;
        }
      }
      next.set(g.id, rg);
    });
    this.groups = next;
    for (const g of next.values()) for (const piece of g.pieces) this.pieceGroup[piece] = g.id;

    // Кусочок, який перейшов в іншу групу (склейка), «довозиться» зі старого місця до нового.
    for (const g of next.values()) {
      for (const piece of g.pieces) {
        if (!fresh && this.pieceSignature[piece] !== g.signature) {
          const before = previousAbs.get(piece);
          if (before) {
            const after = this.pieceOrigin(g, piece, true);
            this.offX[piece] = before.x - after.x;
            this.offY[piece] = before.y - after.y;
          }
        }
        this.pieceSignature[piece] = g.signature;
      }
    }

    // Захоплення, яке сервер не підтвердив: чужий кусочок — відпускаємо; зник — теж.
    if (this.drag) {
      const server = puzzle.groups.find((g) => g.id === this.drag!.groupId);
      if (!server || server.placed || (server.heldBy && server.heldBy !== this.players.meId)) {
        this.drag = null;
      } else if (!server.heldBy && now - this.drag.startedAt > 400 && now - this.drag.lastGrabAttempt > 400) {
        // Сервер уже не вважає кусочок нашим (замок протух): беремо знову.
        this.drag.lastGrabAttempt = now;
        this.cb.grab(this.drag.groupId);
      }
    }
    this.requestDraw();
  }

  applyRemoteMove(event: PuzzleMoveEvent) {
    const g = this.groups.get(event.groupId);
    if (!g || this.drag?.groupId === g.id) return;
    g.tx = event.x;
    g.ty = event.y;
    this.requestDraw();
  }

  applyRemoteCursor(event: PuzzleCursorEvent) {
    this.peerCursor = { x: event.x, y: event.y, at: performance.now() };
    this.requestDraw();
  }

  /** Камера повертається до огляду всього поля. */
  resetCamera() {
    this.userMovedCamera = false;
    this.animateCamera(this.fit);
  }

  zoomBy(factor: number) {
    this.userMovedCamera = true;
    this.cam = clampCamera(
      zoomAt(this.cam, factor, this.cssW / 2, this.cssH / 2, this.fit),
      this.worldRect(),
      this.cssW,
      this.cssH,
    );
    this.requestDraw();
  }

  // ───────────── геометрія й спрайти ─────────────

  private worldRect() {
    return this.puzzle?.world ?? { minX: 0, minY: 0, maxX: 1, maxY: 1 };
  }

  private boardFit(): Camera {
    const p = this.puzzle;
    if (!p) return this.fit;
    return fitRect({ x: 0, y: 0, w: p.boardW, h: p.boardH }, this.cssW, this.cssH, 20);
  }

  private refit() {
    if (!this.puzzle || !this.cssW) return;
    this.fit = fitCamera(this.worldRect(), this.cssW, this.cssH);
    if (!this.userMovedCamera && !this.camAnim) this.cam = this.fit;
  }

  private toPath(piece: number): Path2D {
    const shapes = this.shapes!;
    const outline = pieceOutline(shapes, piece % shapes.cols, Math.floor(piece / shapes.cols));
    const path = new Path2D();
    path.moveTo(outline.start.x, outline.start.y);
    for (const seg of outline.segs) {
      if (seg.kind === "L") path.lineTo(seg.p.x, seg.p.y);
      else path.bezierCurveTo(seg.c1.x, seg.c1.y, seg.c2.x, seg.c2.y, seg.p.x, seg.p.y);
    }
    path.closePath();
    return path;
  }

  private buildSprites() {
    const p = this.puzzle;
    const shapes = this.shapes;
    const img = this.image;
    if (!p || !shapes || !img || !img.naturalWidth || this.outlines.length === 0) {
      this.sprites = [];
      return;
    }
    const m = tabMargin(shapes);
    this.spriteMargin = m;
    const imgPerUnit = img.naturalWidth / p.boardW;
    const pxPerUnit = Math.min(imgPerUnit, MAX_SPRITE_PX / (Math.max(p.cw, p.ch) + 2 * m));
    const sw = Math.ceil((p.cw + 2 * m) * pxPerUnit);
    const sh = Math.ceil((p.ch + 2 * m) * pxPerUnit);
    const total = p.cols * p.rows;
    const sprites: HTMLCanvasElement[] = [];
    for (let piece = 0; piece < total; piece += 1) {
      const col = piece % p.cols;
      const row = Math.floor(piece / p.cols);
      const canvas = document.createElement("canvas");
      canvas.width = sw;
      canvas.height = sh;
      const c = canvas.getContext("2d")!;
      c.imageSmoothingQuality = "high";
      c.scale(sw / (p.cw + 2 * m), sh / (p.ch + 2 * m));
      c.translate(m, m);
      const path = this.outlines[piece];
      c.save();
      c.clip(path);
      // Фрагмент картини під кусочком (з виступами): координати поля → пікселі картини, без виходу за межі.
      const sx = Math.max(0, col * p.cw - m);
      const sy = Math.max(0, row * p.ch - m);
      const ex = Math.min(p.boardW, (col + 1) * p.cw + m);
      const ey = Math.min(p.boardH, (row + 1) * p.ch + m);
      if (ex > sx && ey > sy) {
        c.drawImage(
          img,
          sx * imgPerUnit,
          sy * imgPerUnit,
          (ex - sx) * imgPerUnit,
          (ey - sy) * imgPerUnit,
          sx - col * p.cw,
          sy - row * p.ch,
          ex - sx,
          ey - sy,
        );
      }
      // Світла внутрішня кромка й темний контур — щоб кусочок виглядав «виступаючим».
      c.lineJoin = "round";
      c.lineWidth = Math.max(2, p.cw * 0.03);
      c.strokeStyle = "rgba(255,255,255,0.22)";
      c.stroke(path);
      c.restore();
      c.lineWidth = Math.max(1, p.cw * 0.012);
      c.strokeStyle = "rgba(0,0,0,0.55)";
      c.stroke(path);
      sprites.push(canvas);
    }
    this.sprites = sprites;
  }

  /** Лівий верхній кут комірки кусочка в світі. `ignoreOffset` — без плавного зсуву. */
  private pieceOrigin(g: { x: number; y: number }, piece: number, ignoreOffset = false) {
    const p = this.puzzle!;
    return {
      x: g.x + (piece % p.cols) * p.cw + (ignoreOffset ? 0 : this.offX[piece]),
      y: g.y + Math.floor(piece / p.cols) * p.ch + (ignoreOffset ? 0 : this.offY[piece]),
    };
  }

  private clampOrigin(pieces: number[], x: number, y: number) {
    const p = this.puzzle!;
    let minCol = Infinity;
    let maxCol = -Infinity;
    let minRow = Infinity;
    let maxRow = -Infinity;
    for (const piece of pieces) {
      const col = piece % p.cols;
      const row = Math.floor(piece / p.cols);
      minCol = Math.min(minCol, col);
      maxCol = Math.max(maxCol, col);
      minRow = Math.min(minRow, row);
      maxRow = Math.max(maxRow, row);
    }
    const loX = p.world.minX - minCol * p.cw;
    const hiX = p.world.maxX - (maxCol + 1) * p.cw;
    const loY = p.world.minY - minRow * p.ch;
    const hiY = p.world.maxY - (maxRow + 1) * p.ch;
    return {
      x: Math.min(Math.max(x, loX), Math.max(loX, hiX)),
      y: Math.min(Math.max(y, loY), Math.max(loY, hiY)),
    };
  }

  // ───────────── перетягування й камера ─────────────

  private local(event: PointerEvent | WheelEvent) {
    const rect = this.canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  /** Група під пальцем/курсором (верхня першою); для дотику перевіряємо ще й коло навколо — «товстий палець». */
  private hit(sx: number, sy: number, radiusPx: number): RenderGroup | null {
    const p = this.puzzle;
    if (!p) return null;
    const w = screenToWorld(this.cam, sx, sy);
    const r = radiusPx / this.cam.scale;
    const probes: Array<[number, number]> = [[0, 0]];
    if (r > 0) {
      for (let i = 0; i < 8; i += 1) {
        const a = (i / 8) * Math.PI * 2;
        probes.push([Math.cos(a) * r * 0.6, Math.sin(a) * r * 0.6], [Math.cos(a) * r, Math.sin(a) * r]);
      }
    }
    const ordered = this.drawOrder().reverse();
    for (const [dx, dy] of probes) {
      for (const g of ordered) {
        if (g.placed) continue;
        for (const piece of g.pieces) {
          const o = this.pieceOrigin(g, piece);
          if (this.hitCtx.isPointInPath(this.outlines[piece], w.x + dx - o.x, w.y + dy - o.y)) return g;
        }
      }
    }
    return null;
  }

  private drawOrder(): RenderGroup[] {
    const all = [...this.groups.values()];
    all.sort((a, b) => Number(b.placed) - Number(a.placed) || a.order - b.order);
    if (this.drag) {
      const dragged = this.groups.get(this.drag.groupId);
      if (dragged) return [...all.filter((g) => g !== dragged), dragged];
    }
    return all;
  }

  private onContextMenu = (event: Event) => event.preventDefault();

  private onPointerDown = (event: PointerEvent) => {
    if (!this.puzzle) return;
    this.canvas.setPointerCapture?.(event.pointerId);
    const pos = this.local(event);
    this.pointers.set(event.pointerId, pos);

    if (this.pointers.size >= 2) {
      this.finishDrag();
      this.pan = null;
      const [a, b] = [...this.pointers.values()];
      this.pinch = {
        dist: Math.hypot(a.x - b.x, a.y - b.y) || 1,
        cx: (a.x + b.x) / 2,
        cy: (a.y + b.y) / 2,
      };
      return;
    }

    const forcePan = event.pointerType === "mouse" && event.button !== 0;
    const g = forcePan || this.options.done ? null : this.hit(pos.x, pos.y, event.pointerType === "touch" ? 22 : 6);
    if (g) {
      if (g.heldBy && g.heldBy !== this.players.meId) {
        this.denied = { groupId: g.id, until: performance.now() + 450 };
        this.requestDraw();
        return;
      }
      const w = screenToWorld(this.cam, pos.x, pos.y);
      this.drag = {
        groupId: g.id,
        pointerId: event.pointerId,
        offX: w.x - g.x,
        offY: w.y - g.y,
        startedAt: performance.now(),
        lastSent: 0,
        lastGrabAttempt: performance.now(),
      };
      g.heldBy = this.players.meId;
      this.cb.grab(g.id);
      this.requestDraw();
      return;
    }
    this.pan = { lastX: pos.x, lastY: pos.y, pointerId: event.pointerId };
  };

  private onPointerMove = (event: PointerEvent) => {
    if (!this.puzzle) return;
    const pos = this.local(event);
    if (this.pointers.has(event.pointerId)) this.pointers.set(event.pointerId, pos);

    if (this.pinch && this.pointers.size >= 2) {
      const [a, b] = [...this.pointers.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      const cx = (a.x + b.x) / 2;
      const cy = (a.y + b.y) / 2;
      let cam = zoomAt(this.cam, dist / this.pinch.dist, cx, cy, this.fit);
      cam = { ...cam, x: cam.x + (cx - this.pinch.cx), y: cam.y + (cy - this.pinch.cy) };
      this.cam = clampCamera(cam, this.worldRect(), this.cssW, this.cssH);
      this.pinch = { dist, cx, cy };
      this.userMovedCamera = true;
      this.requestDraw();
      return;
    }

    const w = screenToWorld(this.cam, pos.x, pos.y);
    if (this.drag && this.drag.pointerId === event.pointerId) {
      const g = this.groups.get(this.drag.groupId);
      if (g) {
        const clamped = this.clampOrigin(g.pieces, w.x - this.drag.offX, w.y - this.drag.offY);
        g.x = g.tx = clamped.x;
        g.y = g.ty = clamped.y;
        const now = performance.now();
        if (now - this.drag.lastSent >= SEND_INTERVAL_MS) {
          this.drag.lastSent = now;
          this.cb.move(g.id, g.x, g.y);
        }
        this.sendCursor(w.x, w.y);
        this.requestDraw();
      }
      return;
    }

    if (this.pan && this.pan.pointerId === event.pointerId) {
      this.cam = clampCamera(
        { ...this.cam, x: this.cam.x + pos.x - this.pan.lastX, y: this.cam.y + pos.y - this.pan.lastY },
        this.worldRect(),
        this.cssW,
        this.cssH,
      );
      this.pan.lastX = pos.x;
      this.pan.lastY = pos.y;
      this.userMovedCamera = true;
      this.requestDraw();
      return;
    }
    this.sendCursor(w.x, w.y);
  };

  private onPointerUp = (event: PointerEvent) => {
    this.pointers.delete(event.pointerId);
    if (this.drag && this.drag.pointerId === event.pointerId) this.finishDrag();
    if (this.pan && this.pan.pointerId === event.pointerId) this.pan = null;
    if (this.pointers.size < 2) this.pinch = null;
    this.canvas.releasePointerCapture?.(event.pointerId);
  };

  private onWheel = (event: WheelEvent) => {
    if (!this.puzzle) return;
    event.preventDefault();
    const pos = this.local(event);
    const factor = Math.exp(-event.deltaY * (event.ctrlKey ? 0.01 : 0.0018));
    this.cam = clampCamera(zoomAt(this.cam, factor, pos.x, pos.y, this.fit), this.worldRect(), this.cssW, this.cssH);
    this.userMovedCamera = true;
    this.requestDraw();
  };

  private finishDrag() {
    const drag = this.drag;
    if (!drag) return;
    this.drag = null;
    const g = this.groups.get(drag.groupId);
    if (g) this.cb.drop(g.id, g.x, g.y);
    this.requestDraw();
  }

  private sendCursor(x: number, y: number) {
    const now = performance.now();
    if (now - this.lastCursorSent < CURSOR_INTERVAL_MS) return;
    this.lastCursorSent = now;
    this.cb.cursor(x, y);
  }

  private animateCamera(to: Camera) {
    this.camAnim = { from: { ...this.cam }, to, start: performance.now() };
    this.requestDraw();
  }

  // ───────────── кадр ─────────────

  requestDraw() {
    if (this.raf || this.destroyed) return;
    this.raf = requestAnimationFrame((t) => {
      this.raf = 0;
      const dt = this.lastFrame ? Math.min(64, t - this.lastFrame) : 16;
      this.lastFrame = t;
      const animating = this.update(dt, t);
      this.draw(t);
      if (animating) this.requestDraw();
      else this.lastFrame = 0;
    });
  }

  /** Крок анімацій; true — потрібен ще кадр. */
  private update(dt: number, now: number): boolean {
    let animating = false;
    if (this.camAnim) {
      const t = Math.min(1, (now - this.camAnim.start) / CAM_ANIM_MS);
      const k = easeInOut(t);
      const { from, to } = this.camAnim;
      this.cam = {
        scale: from.scale + (to.scale - from.scale) * k,
        x: from.x + (to.x - from.x) * k,
        y: from.y + (to.y - from.y) * k,
      };
      if (t >= 1) this.camAnim = null;
      else animating = true;
    }
    for (const g of this.groups.values()) {
      if (this.drag?.groupId === g.id) continue;
      if (g.x !== g.tx) {
        const s = stepToward(g.x, g.tx, dt, 60);
        g.x = s.value;
        animating ||= !s.done;
      }
      if (g.y !== g.ty) {
        const s = stepToward(g.y, g.ty, dt, 60);
        g.y = s.value;
        animating ||= !s.done;
      }
    }
    for (let i = 0; i < this.offX.length; i += 1) {
      if (this.offX[i] !== 0) {
        const s = stepToward(this.offX[i], 0, dt, 110);
        this.offX[i] = s.value;
        animating ||= !s.done;
      }
      if (this.offY[i] !== 0) {
        const s = stepToward(this.offY[i], 0, dt, 110);
        this.offY[i] = s.value;
        animating ||= !s.done;
      }
    }
    if (this.denied && now >= this.denied.until) this.denied = null;
    if (this.denied) animating = true;
    if (this.peerCursor && now - this.peerCursor.at < CURSOR_TTL_MS) animating = true;
    if (this.options.done && now - this.doneAt < DONE_FADE_MS + 100) animating = true;
    return animating;
  }

  private draw(now: number) {
    const ctx = this.ctx;
    const p = this.puzzle;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = "#23272e";
    ctx.fillRect(0, 0, this.cssW, this.cssH);
    if (!p) return;
    ctx.setTransform(this.dpr * this.cam.scale, 0, 0, this.dpr * this.cam.scale, this.dpr * this.cam.x, this.dpr * this.cam.y);
    ctx.imageSmoothingQuality = "high";
    const px = 1 / this.cam.scale;

    // Поле: рамка й слабке «привид-зображення» (повніше — коли ввімкнено підказку).
    ctx.fillStyle = "#2e333b";
    ctx.fillRect(0, 0, p.boardW, p.boardH);
    if (this.image) {
      ctx.globalAlpha = this.options.showHint ? 0.5 : 0.07;
      ctx.drawImage(this.image, 0, 0, p.boardW, p.boardH);
      ctx.globalAlpha = 1;
    }
    ctx.lineWidth = 2 * px;
    ctx.strokeStyle = "rgba(255,255,255,0.22)";
    ctx.strokeRect(0, 0, p.boardW, p.boardH);

    const m = this.spriteMargin;
    for (const g of this.drawOrder()) {
      const interesting = !this.options.edgesOnly || g.placed || g.pieces.some((i) => isEdgePiece(i, p.cols, p.rows));
      ctx.globalAlpha = interesting ? 1 : 0.14;
      for (const piece of g.pieces) {
        const o = this.pieceOrigin(g, piece);
        const sprite = this.sprites[piece];
        if (sprite) ctx.drawImage(sprite, o.x - m, o.y - m, p.cw + 2 * m, p.ch + 2 * m);
        else this.drawPlaceholder(o.x, o.y, piece);
      }
      ctx.globalAlpha = 1;
      if (g.heldBy || this.denied?.groupId === g.id) this.drawHold(g, px);
    }

    if (this.options.done && this.image) {
      const t = Math.min(1, (now - this.doneAt) / DONE_FADE_MS);
      ctx.globalAlpha = easeInOut(t);
      ctx.drawImage(this.image, 0, 0, p.boardW, p.boardH);
      ctx.globalAlpha = 1;
      ctx.save();
      ctx.shadowColor = "rgba(255, 214, 120, 0.9)";
      ctx.shadowBlur = 28 * easeInOut(t) * px * this.cam.scale;
      ctx.lineWidth = 3 * px;
      ctx.strokeStyle = `rgba(255, 224, 150, ${0.9 * easeInOut(t)})`;
      ctx.strokeRect(0, 0, p.boardW, p.boardH);
      ctx.restore();
    }

    if (this.peerCursor && now - this.peerCursor.at < CURSOR_TTL_MS) {
      const fade = 1 - (now - this.peerCursor.at) / CURSOR_TTL_MS;
      ctx.globalAlpha = Math.max(0.15, fade);
      this.drawBadge(this.peerCursor.x, this.peerCursor.y, 7 * px, this.players.peerId, PEER_COLOR, px);
      ctx.globalAlpha = 1;
    }
  }

  private drawPlaceholder(x: number, y: number, piece: number) {
    this.ctx.save();
    this.ctx.translate(x, y);
    this.ctx.fillStyle = "rgba(120,130,150,0.5)";
    if (this.outlines[piece]) this.ctx.fill(this.outlines[piece]);
    this.ctx.restore();
  }

  /** Підсвітка кусочка в кольорі того, хто його тримає, і маленька аватарка власника. */
  private drawHold(g: RenderGroup, px: number) {
    const ctx = this.ctx;
    const deniedNow = this.denied?.groupId === g.id;
    const color = deniedNow ? "#ef4444" : g.heldBy === this.players.meId ? MY_COLOR : PEER_COLOR;
    ctx.save();
    ctx.lineWidth = 3 * px;
    ctx.strokeStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 8;
    let first = g.pieces[0];
    for (const piece of g.pieces) {
      first = Math.min(first, piece);
      const o = this.pieceOrigin(g, piece);
      ctx.save();
      ctx.translate(o.x, o.y);
      ctx.stroke(this.outlines[piece]);
      ctx.restore();
    }
    ctx.restore();
    if (g.heldBy && !deniedNow) {
      const o = this.pieceOrigin(g, first);
      this.drawBadge(o.x + this.puzzle!.cw * 0.18, o.y + this.puzzle!.ch * 0.18, 11 * px, g.heldBy, color, px);
    }
  }

  private drawBadge(x: number, y: number, r: number, userId: string | null, color: string, px: number) {
    const ctx = this.ctx;
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    const avatar = userId ? this.avatars.get(userId) : undefined;
    if (avatar && avatar.complete && avatar.naturalWidth) {
      ctx.clip();
      ctx.drawImage(avatar, x - r, y - r, r * 2, r * 2);
    } else {
      const initial = userId === this.players.meId ? this.players.meInitial : this.players.peerInitial;
      ctx.fillStyle = "#fff";
      ctx.font = `700 ${Math.max(6, r * 1.1)}px system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(initial || "•", x, y + px * 0.5);
    }
    ctx.restore();
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.lineWidth = 2 * px;
    ctx.strokeStyle = "#fff";
    ctx.stroke();
    ctx.restore();
  }
}
