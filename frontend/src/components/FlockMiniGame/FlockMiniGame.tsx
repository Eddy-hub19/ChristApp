"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { X } from "lucide-react";
import { getDirectApiOrigin } from "@/lib/apiBase";
import { getAuthToken } from "@/lib/auth";
import { ensureAccessToken } from "@/lib/authSession";
import { FlockClient, type DeathInfo, type FlockStatus } from "./flockClient";
import { joystickDir, inputChanged, pointerDir, type Dir } from "./flockInputMath";
import { drawMinimap, drawScene, THEMES, drawCreature, BONUS_ICON, type Theme } from "./flockRender";
import { SKINS, skinOf } from "./flockSkins";
import {
  loadControlMode,
  loadFlockStats,
  recordFlockRun,
  saveControlMode,
  type ControlMode,
  type FlockStats,
} from "./flockStats";
import styles from "./FlockMiniGame.module.scss";

type Props = {
  open: boolean;
  userId: string;
  onClose: () => void;
};

type Hud = {
  total: number;
  rank: number;
  alive: number;
  top: { pid: number; mass: number; name: string }[];
  selfPid: number;
  effects: { kind: string; remainingMs: number; totalMs: number }[];
};

const EMPTY_HUD: Hud = { total: 0, rank: 0, alive: 0, top: [], selfPid: 0, effects: [] };
const MINIMAP_SIZE = 96;
const SKIN_KEY = "christapp:flock:skin";

function currentTheme(): Theme {
  if (typeof document === "undefined") return THEMES.dark;
  return document.documentElement.dataset.theme === "light" ? THEMES.light : THEMES.dark;
}

function loadSkin() {
  try {
    const v = Number(localStorage.getItem(SKIN_KEY));
    return Number.isInteger(v) && v >= 0 && v < SKINS.length ? v : 0;
  } catch {
    return 0;
  }
}

function lagFromEnv() {
  if (typeof window === "undefined") return 0;
  const v = Number(new URLSearchParams(window.location.search).get("flockLag"));
  return Number.isFinite(v) && v > 0 && v < 2000 ? v : 0;
}

function formatDuration(ms: number) {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function SkinPreview({ skinId, size = 56 }: { skinId: number; size?: number }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const cv = ref.current;
    const ctx = cv?.getContext("2d");
    if (!cv || !ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = cv.height = size * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size, size);
    drawCreature(ctx, skinOf(skinId), size / 2, size / 2 + 1, size * 0.36, 0.5, 0, 0);
  }, [skinId, size]);
  return <canvas ref={ref} style={{ width: size, height: size }} aria-hidden />;
}

export default function FlockMiniGame({ open, userId, onClose }: Props) {
  const t = useTranslations("flock");
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const miniRef = useRef<HTMLCanvasElement | null>(null);
  const stickBaseRef = useRef<HTMLDivElement | null>(null);
  const stickKnobRef = useRef<HTMLDivElement | null>(null);
  const clientRef = useRef<FlockClient | null>(null);
  const dirRef = useRef<Dir>({ angle: 0, power: 0 });
  const throwHeldRef = useRef(false);
  const splitQueuedRef = useRef(false);
  const lastSentRef = useRef<{ dir: Dir; at: number } | null>(null);
  const controlRef = useRef<ControlMode>("follow");
  const themeRef = useRef<Theme>(currentTheme());
  const stickRef = useRef<{ id: number; bx: number; by: number } | null>(null);
  const maxTotalRef = useRef(0);
  const aspectRef = useRef(1);

  const [status, setStatus] = useState<FlockStatus>("connecting");
  const [skin, setSkin] = useState(0);
  const [control, setControl] = useState<ControlMode>("follow");
  const [stats, setStats] = useState<FlockStats>({ bestMass: 0, eaten: 0, topMs: 0, games: 0 });
  const [death, setDeath] = useState<DeathInfo | null>(null);
  const [hud, setHud] = useState<Hud>(EMPTY_HUD);
  const [isTouch, setIsTouch] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    setSkin(loadSkin());
    const mode = loadControlMode();
    setControl(mode);
    controlRef.current = mode;
    setStats(loadFlockStats(userId));
    setIsTouch(window.matchMedia?.("(pointer: coarse)").matches ?? false);
  }, [userId]);

  // тема: стежимо за data-theme на <html>
  useEffect(() => {
    const el = document.documentElement;
    const obs = new MutationObserver(() => {
      themeRef.current = currentTheme();
    });
    obs.observe(el, { attributes: true, attributeFilter: ["data-theme"] });
    return () => obs.disconnect();
  }, []);

  // підключення - тільки поки гра відкрита
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    let client: FlockClient | null = null;
    setStatus("connecting");
    void (async () => {
      let token = getAuthToken();
      if (!token) {
        try {
          token = await ensureAccessToken();
        } catch {
          token = null;
        }
      }
      if (cancelled) return;
      if (!token) {
        setStatus("error");
        return;
      }
      client = new FlockClient({
        url: `${getDirectApiOrigin()}/flock`,
        token,
        lagMs: lagFromEnv(),
        onStatus: (s) => setStatus(s),
        onDeath: (info) => {
          setDeath(info);
          setStats(recordFlockRun(userId, { maxMass: info.maxMass, kills: info.kills, topMs: info.topMs }));
        },
      });
      clientRef.current = client;
    })();
    return () => {
      cancelled = true;
      client?.dispose();
      clientRef.current = null;
    };
  }, [open, userId, attempt]);

  const play = useCallback(() => {
    try {
      localStorage.setItem(SKIN_KEY, String(skin));
    } catch {
      /* ignore */
    }
    maxTotalRef.current = 0;
    setDeath(null);
    clientRef.current?.join(skin);
  }, [skin]);

  const changeControl = (mode: ControlMode) => {
    setControl(mode);
    controlRef.current = mode;
    saveControlMode(mode);
  };

  // --- цикл відмальовки: жодних React-рендерів на кадр ---
  const playing = status === "playing";
  useEffect(() => {
    if (!open || !playing) return;
    const cv = canvasRef.current;
    const ctx = cv?.getContext("2d", { alpha: false });
    const mini = miniRef.current;
    const mctx = mini?.getContext("2d");
    if (!cv || !ctx) return;
    let raf = 0;
    let last = performance.now();
    let lastMini = 0;
    let w = 0;
    let h = 0;
    let dpr = 1;
    const resize = () => {
      const r = cv.getBoundingClientRect();
      dpr = Math.min(2, window.devicePixelRatio || 1);
      w = Math.max(1, Math.round(r.width));
      h = Math.max(1, Math.round(r.height));
      aspectRef.current = w / h;
      if (cv.width !== w * dpr || cv.height !== h * dpr) {
        cv.width = w * dpr;
        cv.height = h * dpr;
      }
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(cv);
    if (mini) {
      const d = Math.min(2, window.devicePixelRatio || 1);
      mini.width = mini.height = MINIMAP_SIZE * d;
    }

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const model = clientRef.current?.model;
      if (!model) return;
      const dt = (now - last) / 1000;
      last = now;
      model.aspect = aspectRef.current;
      model.step(dt, dirRef.current);
      if (model.total > maxTotalRef.current) maxTotalRef.current = model.total;
      drawScene(ctx, model, {
        width: w,
        height: h,
        dpr,
        time: now / 1000,
        theme: themeRef.current,
        selfAngle: dirRef.current.angle,
        showNames: true,
        botLabel: "",
      });
      if (mctx && now - lastMini > 120) {
        lastMini = now;
        drawMinimap(mctx, model, MINIMAP_SIZE, Math.min(2, window.devicePixelRatio || 1), themeRef.current);
      }
    };
    raf = requestAnimationFrame(frame);

    // HUD оновлюємо рідко (4 Гц), а не щокадру
    const hudTimer = setInterval(() => {
      const model = clientRef.current?.model;
      if (!model) return;
      setHud({
        total: model.total,
        rank: model.board.selfRank,
        alive: model.board.alive,
        top: model.board.top,
        selfPid: model.cfg.pid,
        effects: model.effects.map((e) => ({ ...e })),
      });
    }, 250);

    // ввід: ≤15 повідомлень/с, лише при зміні + keepalive
    const sendTimer = setInterval(() => {
      const client = clientRef.current;
      if (!client) return;
      const dir = dirRef.current;
      const split = splitQueuedRef.current;
      const thr = throwHeldRef.current;
      splitQueuedRef.current = false;
      const nowMs = performance.now();
      const prev = lastSentRef.current;
      if (split || thr || inputChanged(prev?.dir ?? null, dir, prev ? nowMs - prev.at : 1e9)) {
        client.sendInput(dir, split, thr, aspectRef.current);
        lastSentRef.current = { dir: { ...dir }, at: nowMs };
      }
    }, 66);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      clearInterval(hudTimer);
      clearInterval(sendTimer);
    };
  }, [open, playing]);

  // клавіатура: пробіл - розділитись, W - кинути
  useEffect(() => {
    if (!open) return;
    const down = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        e.preventDefault();
        if (!e.repeat) splitQueuedRef.current = true;
      } else if (e.code === "KeyW") {
        throwHeldRef.current = true;
      } else if (e.code === "Escape" && !playing) {
        onClose();
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === "KeyW") throwHeldRef.current = false;
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [open, playing, onClose]);

  // жести на канвасі
  const onPointer = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - r.left;
    const py = e.clientY - r.top;
    if (controlRef.current === "joystick" && e.pointerType !== "mouse") {
      const st = stickRef.current;
      if (st && st.id === e.pointerId) {
        dirRef.current = joystickDir(px, py, st.bx, st.by);
        const knob = stickKnobRef.current;
        if (knob) {
          const dx = px - st.bx;
          const dy = py - st.by;
          const d = Math.min(52, Math.hypot(dx, dy));
          const a = Math.atan2(dy, dx);
          knob.style.transform = `translate(${Math.cos(a) * d}px, ${Math.sin(a) * d}px)`;
        }
      }
      return;
    }
    // мишка завжди слідує за курсором; палець - поки торкається
    if (e.pointerType === "mouse" || e.pressure > 0 || e.type === "pointerdown") {
      dirRef.current = pointerDir(px, py, r.width / 2, r.height / 2);
    }
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture?.(e.pointerId);
    if (controlRef.current === "joystick" && e.pointerType !== "mouse") {
      const r = e.currentTarget.getBoundingClientRect();
      const bx = e.clientX - r.left;
      const by = e.clientY - r.top;
      if (!stickRef.current) {
        stickRef.current = { id: e.pointerId, bx, by };
        const base = stickBaseRef.current;
        const knob = stickKnobRef.current;
        if (base) {
          base.style.display = "block";
          base.style.left = `${bx}px`;
          base.style.top = `${by}px`;
        }
        if (knob) knob.style.transform = "translate(0px, 0px)";
      }
      return;
    }
    onPointer(e);
  };

  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.pointerType !== "mouse" && controlRef.current === "follow") {
      dirRef.current = { angle: dirRef.current.angle, power: 0 }; // палець піднято - зупиняємось
    }
    if (stickRef.current?.id === e.pointerId) {
      stickRef.current = null;
      dirRef.current = { angle: dirRef.current.angle, power: 0 };
      if (stickBaseRef.current) stickBaseRef.current.style.display = "none";
    }
  };

  if (!open) return null;

  const rank = hud.rank > 0 ? `#${hud.rank}/${hud.alive}` : "—";
  const showLobby = status === "ready" || status === "connecting" || status === "full" || status === "error" || status === "afk";

  return (
    <div className={styles.overlay} role="dialog" aria-label={t("title")}>
      <canvas
        ref={canvasRef}
        className={styles.canvas}
        onPointerMove={onPointer}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onContextMenu={(e) => e.preventDefault()}
      />
      <div ref={stickBaseRef} className={styles.stickBase} aria-hidden>
        <div ref={stickKnobRef} className={styles.stickKnob} />
      </div>

      <button type="button" className={styles.closeBtn} onClick={onClose} aria-label={t("close")} title={t("close")}>
        <X size={20} aria-hidden />
      </button>

      {playing ? (
        <>
          <div className={styles.massBadge} aria-live="off">
            <span className={styles.massLabel}>{t("hud.mass")}</span>
            <span className={styles.massValue}>{Math.round(hud.total)}</span>
            <span className={styles.rank}>{rank}</span>
          </div>

          <aside className={styles.board} aria-label={t("hud.leaderboard")}>
            <h3>{t("hud.leaderboard")}</h3>
            <ol>
              {hud.top.map((p) => (
                <li key={p.pid} className={p.pid === hud.selfPid ? styles.me : undefined}>
                  <span className={styles.boardName}>{p.name}</span>
                  <span className={styles.boardMass}>{Math.round(p.mass)}</span>
                </li>
              ))}
            </ol>
          </aside>

          <canvas ref={miniRef} className={styles.minimap} style={{ width: MINIMAP_SIZE, height: MINIMAP_SIZE }} aria-hidden />

          {hud.effects.length > 0 ? (
            <ul className={styles.effects}>
              {hud.effects.map((e) => (
                <li key={e.kind} title={t(`bonuses.${e.kind}`)}>
                  <span className={styles.effectIcon}>{BONUS_ICON[e.kind]}</span>
                  <span className={styles.effectBar}>
                    <span style={{ width: `${Math.max(0, Math.min(100, (e.remainingMs / Math.max(1, e.totalMs)) * 100))}%` }} />
                  </span>
                </li>
              ))}
            </ul>
          ) : null}

          <div className={styles.actions}>
            <button
              type="button"
              className={styles.actionBtn}
              onPointerDown={(e) => {
                e.preventDefault();
                splitQueuedRef.current = true;
              }}
            >
              {t("controls.split")}
            </button>
            <button
              type="button"
              className={styles.actionBtn}
              onPointerDown={(e) => {
                e.preventDefault();
                throwHeldRef.current = true;
              }}
              onPointerUp={() => (throwHeldRef.current = false)}
              onPointerLeave={() => (throwHeldRef.current = false)}
              onPointerCancel={() => (throwHeldRef.current = false)}
            >
              {t("controls.throw")}
            </button>
          </div>
          {!isTouch ? <p className={styles.keyHint}>{t("controls.keys")}</p> : null}
        </>
      ) : null}

      {status === "dead" && death ? (
        <div className={styles.cardWrap}>
          <div className={styles.card} role="alertdialog" aria-label={t("dead.title")}>
            <h2>{t("dead.title")}</h2>
            {death.killer ? <p className={styles.sub}>{t("dead.by", { name: death.killer })}</p> : null}
            <dl className={styles.summary}>
              <div>
                <dt>{t("dead.maxSize")}</dt>
                <dd>{Math.round(death.maxMass)}</dd>
              </div>
              <div>
                <dt>{t("dead.time")}</dt>
                <dd>{formatDuration(death.survivedMs)}</dd>
              </div>
              <div>
                <dt>{t("dead.ate")}</dt>
                <dd>{death.kills > 0 ? `${death.kills}` : t("dead.nobody")}</dd>
              </div>
            </dl>
            {death.killed.length > 0 ? <p className={styles.killed}>{death.killed.join(", ")}</p> : null}
            <div className={styles.cardButtons}>
              <button type="button" className={styles.primary} onClick={play} autoFocus>
                {t("again")}
              </button>
              <button type="button" className={styles.secondary} onClick={onClose}>
                {t("close")}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showLobby ? (
        <div className={styles.cardWrap}>
          <div className={styles.card}>
            <h2>{t("title")}</h2>
            <p className={styles.sub}>{t("tagline")}</p>

            <h3 className={styles.h3}>{t("chooseSkin")}</h3>
            <div className={styles.skins} role="radiogroup" aria-label={t("chooseSkin")}>
              {SKINS.map((_, i) => (
                <button
                  key={i}
                  type="button"
                  role="radio"
                  aria-checked={skin === i}
                  aria-label={t(`skins.${i}`)}
                  title={t(`skins.${i}`)}
                  className={`${styles.skin} ${skin === i ? styles.skinActive : ""}`}
                  onClick={() => setSkin(i)}
                >
                  <SkinPreview skinId={i} />
                </button>
              ))}
            </div>

            <h3 className={styles.h3}>{t("controls.title")}</h3>
            <div className={styles.segment} role="radiogroup" aria-label={t("controls.title")}>
              <button type="button" role="radio" aria-checked={control === "follow"} className={control === "follow" ? styles.segActive : undefined} onClick={() => changeControl("follow")}>
                {isTouch ? t("controls.follow") : t("controls.mouse")}
              </button>
              <button type="button" role="radio" aria-checked={control === "joystick"} className={control === "joystick" ? styles.segActive : undefined} onClick={() => changeControl("joystick")}>
                {t("controls.joystick")}
              </button>
            </div>

            <dl className={styles.stats}>
              <div>
                <dt>{t("stats.best")}</dt>
                <dd>{stats.bestMass}</dd>
              </div>
              <div>
                <dt>{t("stats.eaten")}</dt>
                <dd>{stats.eaten}</dd>
              </div>
              <div>
                <dt>{t("stats.top1")}</dt>
                <dd>{formatDuration(stats.topMs)}</dd>
              </div>
            </dl>

            {status === "full" ? <p className={styles.error}>{t("status.full")}</p> : null}
            {status === "afk" ? <p className={styles.error}>{t("status.afk")}</p> : null}
            {status === "error" ? <p className={styles.error}>{t("status.error")}</p> : null}

            <div className={styles.cardButtons}>
              {status === "error" || status === "afk" || status === "full" ? (
                <button type="button" className={styles.primary} onClick={() => setAttempt((n) => n + 1)}>
                  {t("retry")}
                </button>
              ) : (
                <button type="button" className={styles.primary} onClick={play} disabled={status !== "ready"}>
                  {status === "ready" ? t("play") : t("connecting")}
                </button>
              )}
              <button type="button" className={styles.secondary} onClick={onClose}>
                {t("close")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
