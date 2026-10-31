/**
 * Відмальовка режиму «Замки» поверх звичайної сцени: світ (ріка, декор, зони, замки), кільця й індикатори команд,
 * камені, маркери несучих, стрілки до несучого й до власної бази, мінікарта. Лише кешовані спрайти й прості фігури.
 */
import { TEAM_COLOR, castleOf, decorFor, type Team } from "./flockCastles";
import { drawBaseZone, drawCastle, drawDecor, drawLake, drawLakeMinimap, stoneSprite } from "./flockCastleArt";
import type { FlockModel, RCell } from "./flockModel";

const TAU = Math.PI * 2;
const teams: Team[] = [1, 2];

/** Ріка, декор, зони баз і замки (під клітинами). */
export function drawCastleWorld(ctx: CanvasRenderingContext2D, m: FlockModel, x0: number, x1: number, y0: number, y1: number, pxPerUnit: number, time: number) {
  const cfg = m.cfg.castle;
  if (!cfg) return;
  drawLake(ctx, cfg, x0, x1, y0, y1, time, pxPerUnit);
  drawDecor(ctx, decorFor(cfg, m.thorns, m.cfg.radiusK), cfg.seed, cfg.world, x0, x1, y0, y1, pxPerUnit);
  const cs = m.castle;
  for (const t of teams) {
    const k = castleOf(cfg, t);
    if (k.x < x0 - k.r || k.x > x1 + k.r || k.y < y0 - k.r || k.y > y1 + k.r) continue;
    drawBaseZone(ctx, cfg, t);
    drawCastle(ctx, cfg, t, cs?.hp[t - 1] ?? m.castle?.hpMax ?? 100, cs?.hpMax ?? 100, cs?.st[t - 1] ?? 0, time, pxPerUnit);
  }
  // камені, що лежать на землі
  if (cs) {
    for (const [id, x, y, owner, left] of cs.ls) {
      if (x < x0 - 60 || x > x1 + 60 || y < y0 - 60 || y > y1 + 60) continue;
      const bob = Math.sin(time * 4 + id) * 3;
      const s = 44;
      // повільно блимає, коли скоро повернеться сам
      const lms = left - (m.localNow - cs.t0);
      if (lms < 4000 && Math.floor(time * 5) % 2 === 0) ctx.globalAlpha = 0.45;
      ctx.drawImage(stoneSprite(owner === 2 ? 2 : 1), x - s / 2, y - s / 2 + bob, s, s);
      ctx.globalAlpha = 1;
    }
  }
}

/** Кільце команди під кожною клітиною (до самих клітин). */
export function drawTeamRings(ctx: CanvasRenderingContext2D, m: FlockModel, cells: RCell[], scale: number) {
  const me = m.cfg.pid;
  for (const c of cells) {
    const t = m.teams.get(c.pid);
    if (!t) continue;
    const r = m.radiusOf(c.mass);
    ctx.strokeStyle = TEAM_COLOR[t].main;
    ctx.globalAlpha = 0.9;
    ctx.lineWidth = Math.max(3 / scale, r * 0.16);
    ctx.beginPath();
    ctx.arc(c.x, c.y, r * 1.2, 0, TAU);
    ctx.stroke();
    if (c.pid === me) {
      ctx.strokeStyle = "rgba(255,255,255,0.9)";
      ctx.lineWidth = Math.max(1.5 / scale, r * 0.05);
      ctx.beginPath();
      ctx.arc(c.x, c.y, r * 1.34, 0, TAU);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
}

function pointer(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, team: Team, outline: number) {
  ctx.fillStyle = TEAM_COLOR[team].main;
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = outline;
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(x - s, y - s * 1.1);
  ctx.lineTo(x + s, y - s * 1.1);
  ctx.lineTo(x, y);
  ctx.closePath();
  ctx.stroke();
  ctx.fill();
}

/** Трикутний індикатор команди над клітиною й значок каменя над несучими (видно всім, навіть коли несучий у кущі). */
export function drawTeamMarkers(ctx: CanvasRenderingContext2D, m: FlockModel, cells: RCell[], scale: number, time: number) {
  const cs = m.castle;
  const drawn = new Set<number>();
  for (const c of cells) {
    const t = m.teams.get(c.pid);
    if (!t) continue;
    const r = m.radiusOf(c.mass);
    const s = Math.max(r * 0.45, 7 / scale);
    pointer(ctx, c.x, c.y - r * 1.3, s, t, Math.max(1.2 / scale, s * 0.18));
    drawn.add(c.pid);
  }
  if (!cs) return;
  for (const [pid, x, y, owner] of cs.cr) {
    const cell = m.cells.get(findCellId(m, pid));
    const px = cell ? cell.x : x;
    const py = cell ? cell.y : y;
    const r = cell ? m.radiusOf(cell.mass) : m.cfg.castle ? m.radiusOf(m.cfg.castle.mass) : 24;
    const size = Math.max(r * 1.5, 22 / scale);
    const bob = Math.sin(time * 5 + pid) * size * 0.07;
    ctx.drawImage(stoneSprite(owner === 2 ? 2 : 1), px - size / 2, py - r * 1.3 - size * 1.55 + bob, size, size);
    if (!cell) {
      // несучий у кущі: клітини не видно - лише маркер з кільцем на місці
      const t = (m.teams.get(pid) ?? (owner === 1 ? 2 : 1)) as Team;
      ctx.strokeStyle = TEAM_COLOR[t].main;
      ctx.lineWidth = Math.max(2 / scale, 3);
      ctx.beginPath();
      ctx.arc(px, py, r * 1.25, 0, TAU);
      ctx.stroke();
    }
  }
}

function findCellId(m: FlockModel, pid: number): number {
  for (const c of m.cells.values()) if (c.pid === pid) return c.id;
  return -1;
}

function edgeArrow(ctx: CanvasRenderingContext2D, W: number, H: number, sx: number, sy: number, color: string, label?: CanvasImageSource) {
  const cx = W / 2;
  const cy = H / 2;
  const ang = Math.atan2(sy - cy, sx - cx);
  const pad = 46;
  const k = Math.min((W / 2 - pad) / Math.max(1e-6, Math.abs(Math.cos(ang))), (H / 2 - pad - 40) / Math.max(1e-6, Math.abs(Math.sin(ang))));
  const x = cx + Math.cos(ang) * k;
  const y = cy + Math.sin(ang) * k;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(ang);
  ctx.fillStyle = color;
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(14, 0);
  ctx.lineTo(-8, -10);
  ctx.lineTo(-8, 10);
  ctx.closePath();
  ctx.stroke();
  ctx.fill();
  ctx.restore();
  if (label) ctx.drawImage(label, x - 13 - Math.cos(ang) * 22, y - 13 - Math.sin(ang) * 22, 26, 26);
}

/** Екранні стрілки: до несучих камінь за межами екрана й (коли я несу) до своєї бази. */
export function drawCastleScreenArrows(ctx: CanvasRenderingContext2D, m: FlockModel, W: number, H: number, scale: number, time: number) {
  const cs = m.castle;
  const cfg = m.cfg.castle;
  if (!cs || !cfg) return;
  const toScreen = (x: number, y: number) => [W / 2 + (x - m.camX) * scale, H / 2 + (y - m.camY) * scale] as const;
  for (const [pid, x, y, owner] of cs.cr) {
    const [sx, sy] = toScreen(x, y);
    if (sx > 20 && sx < W - 20 && sy > 60 && sy < H - 20) continue;
    const t = (m.teams.get(pid) ?? (owner === 1 ? 2 : 1)) as Team;
    edgeArrow(ctx, W, H, sx, sy, TEAM_COLOR[t].main, stoneSprite(owner === 2 ? 2 : 1));
  }
  if (m.carryingStone()) {
    const own = m.ownCells()[0];
    if (!own) return;
    const home = castleOf(cfg, cfg.team);
    const [sx, sy] = toScreen(own.x, own.y);
    const [hx, hy] = toScreen(home.x, home.y);
    const dist = Math.hypot(hx - sx, hy - sy);
    const r = m.radiusOf(own.mass) * scale;
    if (dist < home.r * scale * 0.9) return; // уже на базі
    const ang = Math.atan2(hy - sy, hx - sx);
    const off = r * 1.9 + 14 + Math.sin(time * 6) * 3;
    ctx.save();
    ctx.translate(sx + Math.cos(ang) * off, sy + Math.sin(ang) * off);
    ctx.rotate(ang);
    ctx.fillStyle = TEAM_COLOR[cfg.team].main;
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(16, 0);
    ctx.lineTo(-8, -11);
    ctx.lineTo(-3, 0);
    ctx.lineTo(-8, 11);
    ctx.closePath();
    ctx.stroke();
    ctx.fill();
    ctx.restore();
  }
}

/** Мінікарта режиму: ріка, мости, замки, союзники, несучі камені, лежачі камені, я. */
export function drawCastleMinimap(ctx: CanvasRenderingContext2D, m: FlockModel, size: number) {
  const cfg = m.cfg.castle;
  if (!cfg) return;
  const k = size / cfg.world;
  drawLakeMinimap(ctx, cfg, size);
  const cs = m.castle;
  for (const t of teams) {
    const c = castleOf(cfg, t);
    const hp = cs?.hp[t - 1] ?? 1;
    const s = 11;
    ctx.fillStyle = hp > 0 ? TEAM_COLOR[t].main : "#555";
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.rect(c.x * k - s / 2, c.y * k - s / 2, s, s);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#fff";
    ctx.fillRect(c.x * k - s / 2, c.y * k - s / 2 - 2, s, 2);
  }
  if (cs) {
    ctx.fillStyle = TEAM_COLOR[cfg.team].light;
    for (const [, x, y] of cs.al) {
      ctx.beginPath();
      ctx.arc(x * k, y * k, 2.2, 0, TAU);
      ctx.fill();
    }
    for (const [, x, y, owner] of cs.ls) ctx.drawImage(stoneSprite(owner === 2 ? 2 : 1), x * k - 4, y * k - 4, 8, 8);
    for (const [pid, x, y, owner] of cs.cr) {
      const t = (m.teams.get(pid) ?? (owner === 1 ? 2 : 1)) as Team;
      ctx.fillStyle = TEAM_COLOR[t].main;
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(x * k, y * k, 3.6, 0, TAU);
      ctx.fill();
      ctx.stroke();
      ctx.drawImage(stoneSprite(owner === 2 ? 2 : 1), x * k - 5, y * k - 14, 10, 10);
    }
  }
}
