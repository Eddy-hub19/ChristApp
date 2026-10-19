"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useFullscreenMode } from "@/contexts/TabBarOverlayContext";
import { useTranslations } from "next-intl";
import { Lock, X } from "lucide-react";
import RubyIcon from "@/components/RubyIcon/RubyIcon";
import { FREE_SKINS, HIDDEN_SKIN_IDS, isPaidSkin, isPremiumSkin, isSpecialSkin, PAID_SKIN_IDS, PREMIUM_SKIN_IDS, SPECIAL_SKIN_IDS } from "@/lib/rubies";
import { visibleSkinIds } from "./flockSkinVisibility";
import { getDirectApiOrigin } from "@/lib/apiBase";
import { getAuthToken } from "@/lib/auth";
import { ensureAccessToken } from "@/lib/authSession";
import { FlockClient, type DeathInfo, type FlockNotice, type FlockStatus, type RewardInfo } from "./flockClient";
import { buyFlockSkin, fetchFlockMe, FlockApiError, importFlockStats, markWhatsNewSeen, selectFlockSkin, type FlockMe } from "./flockApi";
import FlockInvite from "./FlockInvite";
import { isResumable, loadFlockSession } from "./flockSession";
import FlockWhatsNew from "./FlockWhatsNew";
import { decideAnnouncement, loadLocalSeen, saveLocalSeen, type Announcement } from "./flockWhatsNewLogic";
import { joystickDir, inputChanged, pointerDir, type Dir } from "./flockInputMath";
import { drawMinimap, drawScene, THEMES, drawCreature, BONUS_ICON, type Theme } from "./flockRender";
import { animFrame, SKINS, skinOf } from "./flockSkins";
import { isSpecialDeco } from "./flockSpecialDeco";
import { prefersReducedMotion } from "./flockSprites";
import { subscribePreviewTick } from "./flockPreviewTicker";
import {
  clearLegacyFlockStats,
  EMPTY_FLOCK_STATS,
  loadControlMode,
  loadLegacyFlockStats,
  saveControlMode,
  type ControlMode,
  type FlockStats,
} from "./flockStats";
import styles from "./FlockMiniGame.module.scss";

type Props = {
  open: boolean;
  userId: string;
  /** Арена з посилання-запрошення (для нового входу). */
  arenaId?: number | null;
  onClose: () => void;
};

type Hud = {
  total: number;
  rank: number;
  alive: number;
  top: { pid: number; mass: number; name: string }[];
  selfPid: number;
  effects: { kind: string; remainingMs: number; totalMs: number }[];
  arenaId: number | null;
};

const EMPTY_HUD: Hud = { total: 0, rank: 0, alive: 0, top: [], selfPid: 0, effects: [], arenaId: null };
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

/** `?flockDebug=1`: кладе модель в window.__flockModel (для замірів плавності/FPS у браузерних тестах). */
function debugFromEnv() {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).get("flockDebug") === "1";
}

function formatDuration(ms: number) {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Прев'ю скіна; преміум анімується (кадри 8/с від одного спільного таймера), при «зменшити рух» - статичний кадр. */
function SkinPreview({ skinId, size = 56 }: { skinId: number; size?: number }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const cv = ref.current;
    const ctx = cv?.getContext("2d");
    if (!cv || !ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = cv.height = size * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const skin = skinOf(skinId);
    // Шари анімації виходять за радіус тіла - преміум малюємо трохи меншим, щоб не обрізались краєм полотна.
    // Особливі виступають за тіло (кристали, капелюшок, антена) - теж трохи менші.
    const radius = skin.anim ? size * 0.27 : isSpecialDeco(skin.deco) ? size * 0.3 : size * 0.36;
    const draw = (frame: number) => {
      ctx.clearRect(0, 0, size, size);
      drawCreature(ctx, skin, size / 2, size / 2 + 1, radius, 0.5, 0, 0, frame);
    };
    draw(0);
    if (!skin.anim || prefersReducedMotion()) return;
    let last = 0;
    return subscribePreviewTick(() => {
      const f = animFrame(skin, performance.now() / 1000);
      if (f !== last) {
        last = f;
        draw(f);
      }
    });
  }, [skinId, size]);
  return <canvas ref={ref} style={{ width: size, height: size }} aria-hidden />;
}

export default function FlockMiniGame({ open, userId, arenaId = null, onClose }: Props) {
  // Навбар і лампочка теми не потрібні на арені — ні на маршруті /games/flock, ні в модалці з чату.
  useFullscreenMode(open);
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
  const [stats, setStats] = useState<FlockStats>(EMPTY_FLOCK_STATS);
  const [me, setMe] = useState<FlockMe | null>(null);
  const [previewSkin, setPreviewSkin] = useState<number | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [buying, setBuying] = useState(false);
  const [buyError, setBuyError] = useState<string | null>(null);
  /** Напис «Зорепад!» (id - щоб анімація стартувала знову при повторі події). */
  const [zorepad, setZorepad] = useState<number | null>(null);
  const [scissorsMsg, setScissorsMsg] = useState<{ id: number; taker: boolean; count: number } | null>(null);
  const [reward, setReward] = useState<(RewardInfo & { id: number }) | null>(null);
  const [death, setDeath] = useState<DeathInfo | null>(null);
  const [hud, setHud] = useState<Hud>(EMPTY_HUD);
  const [isTouch, setIsTouch] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [notice, setNotice] = useState<FlockNotice>(null);
  /** Разовый бонус за первый вход (показывается один раз в лобби). */
  const [entryBonus, setEntryBonus] = useState(0);
  const [reconnectLeft, setReconnectLeft] = useState(0);
  const [announcement, setAnnouncement] = useState<Announcement | null>(null);
  const announcedRef = useRef(false);
  const resumableAtOpenRef = useRef(false);

  // «Що нового» / «Ласкаво просимо»: решаем один раз за открытие, когда пришёл профиль с сервера.
  useEffect(() => {
    if (!open) {
      announcedRef.current = false;
      setAnnouncement(null);
      return;
    }
    resumableAtOpenRef.current = isResumable(loadFlockSession());
  }, [open]);
  useEffect(() => {
    if (!open || !me || announcedRef.current) return;
    const a = decideAnnouncement({
      serverSeen: me.whatsNewSeen ?? 0,
      localSeen: loadLocalSeen(userId),
      games: me.stats.games,
      status,
      resumable: resumableAtOpenRef.current,
    });
    if (!a) return;
    announcedRef.current = true;
    setAnnouncement(a);
    // «один раз»: помечаем как просмотренное сразу при показе (локально и на сервере)
    saveLocalSeen(userId, a.version);
    void markWhatsNewSeen(a.version).catch(() => undefined);
  }, [open, me, status, userId]);

  useEffect(() => {
    setSkin(loadSkin());
    const mode = loadControlMode();
    setControl(mode);
    controlRef.current = mode;
    setIsTouch(window.matchMedia?.("(pointer: coarse)").matches ?? false);
  }, [userId]);

  /** Баланс, куплені скіни й статистика - з сервера; стара статистика з localStorage переноситься один раз. */
  const refreshMe = useCallback(async () => {
    try {
      let data = await fetchFlockMe();
      if (!data.statsImported) {
        const legacy = loadLegacyFlockStats(userId);
        if (legacy) {
          const res = await importFlockStats(legacy);
          clearLegacyFlockStats(userId);
          data = { ...data, stats: res.stats, statsImported: true };
        } else {
          // нічого переносити: позначимо, щоб не питати щоразу
          await importFlockStats(EMPTY_FLOCK_STATS);
          clearLegacyFlockStats(userId);
        }
      }
      setMe(data);
      if (data.entryBonus) setEntryBonus(data.entryBonus);
      setStats(data.stats);
      // обраний скін мусить бути доступним (безкоштовний або куплений)
      setSkin((cur) => (isPaidSkin(cur) && !data.ownedSkins.includes(cur) ? 0 : cur));
    } catch {
      /* офлайн: лобі працює з безкоштовними скінами */
    }
  }, [userId]);

  useEffect(() => {
    if (open) void refreshMe();
  }, [open, refreshMe]);

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
        arenaId,
        autoResume: true,
        onNotice: setNotice,
        onStatus: (s) => setStatus(s),
        onZorepad: () => setZorepad(Date.now()),
        onScissors: (r) => setScissorsMsg({ id: Date.now(), taker: r.taker, count: r.count }),
        onReward: (r) => {
          setReward({ ...r, id: Date.now() });
          setMe((m) => (m ? { ...m, rubies: r.balance } : m));
        },
        onDeath: (info) => {
          setDeath(info);
          // статистику пише сервер; через мить тягнемо оновлену
          setTimeout(() => void refreshMe(), 800);
        },
      });
      clientRef.current = client;
    })();
    return () => {
      cancelled = true;
      client?.dispose();
      clientRef.current = null;
    };
  }, [open, userId, attempt, arenaId, refreshMe]);

  const play = useCallback(() => {
    try {
      localStorage.setItem(SKIN_KEY, String(skin));
    } catch {
      /* ignore */
    }
    maxTotalRef.current = 0;
    setDeath(null);
    setReward(null);
    if (isPaidSkin(skin)) void selectFlockSkin(skin).catch(() => undefined);
    clientRef.current?.join(skin);
  }, [skin]);

  useEffect(() => {
    if (zorepad === null) return;
    const id = setTimeout(() => setZorepad(null), 2600);
    return () => clearTimeout(id);
  }, [zorepad]);

  useEffect(() => {
    if (scissorsMsg === null) return;
    const id = setTimeout(() => setScissorsMsg(null), 2200);
    return () => clearTimeout(id);
  }, [scissorsMsg]);

  // «+10»: підпис і анімація зникають самі
  useEffect(() => {
    if (!reward) return;
    const id = setTimeout(() => setReward(null), 3500);
    return () => clearTimeout(id);
  }, [reward]);

  const openSkin = (i: number) => {
    setBuyError(null);
    setConfirming(false);
    if (isPaidSkin(i) && !me?.ownedSkins.includes(i)) {
      setPreviewSkin(i);
      return;
    }
    setPreviewSkin(null);
    setSkin(i);
  };

  const buy = async (i: number) => {
    setBuying(true);
    setBuyError(null);
    try {
      const res = await buyFlockSkin(i);
      setMe((m) => (m ? { ...m, rubies: res.rubies, ownedSkins: [...m.ownedSkins, i].sort((a, b) => a - b) } : m));
      setSkin(i);
      setPreviewSkin(null);
      setConfirming(false);
    } catch (e) {
      const code = e instanceof FlockApiError ? e.code : null;
      setBuyError(code === "not_enough" || code === "already_owned" ? code : "generic");
      if (code === "already_owned" || code === "not_enough") void refreshMe();
      setConfirming(false);
    } finally {
      setBuying(false);
    }
  };

  const changeControl = (mode: ControlMode) => {
    setControl(mode);
    controlRef.current = mode;
    saveControlMode(mode);
  };

  // скрытые скины (сервер: config.hiddenSkins) не показываем, пока профиль не загружен - тоже; купленные остаются
  const hiddenSkins = me ? (me.config.hiddenSkins ?? []) : HIDDEN_SKIN_IDS;
  const ownedSkins = me?.ownedSkins ?? null;
  const freeIds = Array.from({ length: FREE_SKINS }, (_, i) => i);
  const paidIds = visibleSkinIds(PAID_SKIN_IDS, hiddenSkins, ownedSkins);
  const premiumIds = visibleSkinIds(PREMIUM_SKIN_IDS, hiddenSkins, ownedSkins);
  const specialIds = visibleSkinIds(SPECIAL_SKIN_IDS, hiddenSkins, ownedSkins);
  /** Ряд без пустых ячеек: колонок ровно столько, сколько скинов (но не больше 6). */
  const rowCols = (ids: readonly number[]) => ({ gridTemplateColumns: `repeat(${Math.min(6, Math.max(1, ids.length))}, 1fr)` });

  const priceOf = (i: number) =>
    isSpecialSkin(i) ? (me?.config.specialSkinPrice ?? 40) : isPremiumSkin(i) ? (me?.config.premiumSkinPrice ?? 60) : (me?.config.skinPrice ?? 20);

  const skinButton = (i: number) => {
    const locked = isPaidSkin(i) && !me?.ownedSkins.includes(i);
    return (
      <button
        key={i}
        type="button"
        role="radio"
        aria-checked={skin === i}
        aria-label={locked ? `${t(`skins.${i}`)}: ${t("rubies.locked")}, ${t("rubies.price", { price: priceOf(i) })}` : t(`skins.${i}`)}
        title={t(`skins.${i}`)}
        className={`${styles.skin} ${isPremiumSkin(i) ? styles.skinPremium : ""} ${isSpecialSkin(i) ? styles.skinSpecial : ""} ${skin === i ? styles.skinActive : ""} ${locked ? styles.skinLocked : ""}`}
        onClick={() => openSkin(i)}
      >
        <SkinPreview skinId={i} />
        {locked ? (
          <>
            <span className={styles.lockBadge}>
              <Lock size={12} aria-hidden />
            </span>
            <span className={styles.priceTag}>
              <RubyIcon size={11} />
              {priceOf(i)}
            </span>
          </>
        ) : null}
      </button>
    );
};

  // --- цикл відмальовки: жодних React-рендерів на кадр ---
  // reconnecting: звʼязок обірвався, але екран гри лишається (овечка чекає на сервері)
  const playing = status === "playing" || status === "reconnecting";
  const reconnecting = status === "reconnecting";

  useEffect(() => {
    if (!reconnecting) return;
    const tick = () => {
      const s = loadFlockSession();
      setReconnectLeft(s ? Math.max(0, Math.ceil((s.pauseMs - (Date.now() - s.savedAt)) / 1000)) : 0);
    };
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [reconnecting]);

  /** Явний вихід: сервер прибирає овечку одразу, без паузи. */
  const handleClose = useCallback(() => {
    clientRef.current?.leave();
    clientRef.current = null;
    onClose();
  }, [onClose]);
  useEffect(() => {
    if (!open || !playing) return;
    const cv = canvasRef.current;
    const ctx = cv?.getContext("2d", { alpha: false });
    const mini = miniRef.current;
    const mctx = mini?.getContext("2d");
    if (!cv || !ctx) return;
    let raf = 0;
    const debug = debugFromEnv();
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
      model.step(dt, dirRef.current, now);
      if (debug) (window as unknown as { __flockModel?: unknown }).__flockModel = model;
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
        rank: model.rank(),
        alive: model.board.alive,
        top: model.board.top,
        selfPid: model.cfg.pid,
        arenaId: model.cfg.arenaId,
        effects: model.effects.map((e) => ({ ...e })),
      });
    }, 250);

    // ввід: не частіше за тік сервера (10/с) - зайві повідомлення сервер усе одно відкине; лише при зміні + keepalive
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
    }, 100);

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
        handleClose();
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
  }, [open, playing, handleClose]);

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
  const showLobby =
    status === "ready" ||
    status === "connecting" ||
    status === "resuming" ||
    status === "full" ||
    status === "error" ||
    status === "afk" ||
    status === "taken";

  return (
    <div className={styles.overlay} role="dialog" aria-modal="true" data-app-overlay aria-label={t("title")}>
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

      <button type="button" className={styles.closeBtn} onClick={handleClose} aria-label={t("close")} title={t("close")}>
        <X size={20} aria-hidden />
      </button>

      {playing ? (
        <>
          <FlockInvite arenaId={() => clientRef.current?.model?.cfg.arenaId ?? hud.arenaId} className={styles.hudInvite} />
          {reconnecting ? (
            <div className={styles.reconnect} role="status">
              <span className={styles.spinner} aria-hidden />
              <span>{t("reconnecting", { seconds: reconnectLeft })}</span>
            </div>
          ) : null}
          {zorepad !== null ? (
            <div key={zorepad} className={styles.zorepadBanner} role="status">
              {t("events.zorepad")}
            </div>
          ) : null}
          {scissorsMsg ? (
            <div key={scissorsMsg.id} className={styles.scissorsBanner} role="status">
              {scissorsMsg.taker ? t("events.scissorsTaker", { count: scissorsMsg.count }) : t("events.scissorsVictim")}
            </div>
          ) : null}
          {reward ? (
            <div key={reward.id} className={styles.rewardPop} role="status">
              <span className={styles.rewardAmount}>
                <RubyIcon size={36} />+{reward.amount}
              </span>
              <span className={styles.rewardText}>{t("rubies.reward", { count: reward.amount })}</span>
            </div>
          ) : null}
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
                <li key={e.kind} title={t(`bonuses.${e.kind}`)} className={e.kind === "boost" || e.kind === "freeze" ? styles.effectLabeled : undefined}>
                  <span className={styles.effectIcon}>{BONUS_ICON[e.kind]}</span>
                  {e.kind === "boost" || e.kind === "freeze" ? <span className={styles.effectLabel}>{t(`bonuses.${e.kind}`)}</span> : null}
                  <span className={styles.effectBar}>
                    <span style={{ width: `${Math.max(0, Math.min(100, (e.remainingMs / Math.max(1, e.totalMs)) * 100))}%` }} />
                  </span>
                  {e.kind === "freeze" ? <span className={styles.effectTime}>{Math.max(1, Math.ceil(e.remainingMs / 1000))}</span> : null}
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
              <button type="button" className={styles.secondary} onClick={handleClose}>
                {t("close")}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {announcement && showLobby ? (
        <FlockWhatsNew
          announcement={announcement}
          canPlay={status === "ready"}
          onClose={(withPlay) => {
            setAnnouncement(null);
            if (withPlay) play();
          }}
        />
      ) : null}

      {showLobby ? (
        <div className={styles.cardWrap}>
          <div className={styles.card}>
            <div className={styles.cardHead}>
              <h2>{t("title")}</h2>
              <div className={styles.balance} aria-label={t("rubies.balance", { count: me?.rubies ?? 0 })} title={t("rubies.name")}>
                <RubyIcon size={18} />
                <span>{me?.rubies ?? 0}</span>
              </div>
            </div>
            <p className={styles.sub}>{t("tagline")}</p>

            <h3 className={styles.h3}>{t("chooseSkin")}</h3>
            <div className={styles.skins} role="radiogroup" aria-label={t("chooseSkin")}>
              {freeIds.map((i) => skinButton(i))}
            </div>
            {paidIds.length > 0 ? (
              <div className={styles.skins} style={{ ...rowCols(paidIds), marginTop: 6 }} role="radiogroup" aria-label={t("chooseSkin")}>
                {paidIds.map((i) => skinButton(i))}
              </div>
            ) : null}
            {premiumIds.length > 0 ? (
              <>
                <h3 className={`${styles.h3} ${styles.premiumTitle}`}>{t("premium")}</h3>
                <div className={styles.skins} style={rowCols(premiumIds)} role="radiogroup" aria-label={t("premium")}>
                  {premiumIds.map((i) => skinButton(i))}
                </div>
              </>
            ) : null}
            {specialIds.length > 0 ? (
              <>
                <h3 className={`${styles.h3} ${styles.specialTitle}`}>{t("special")}</h3>
                <div className={styles.skins} style={rowCols(specialIds)} role="radiogroup" aria-label={t("special")}>
                  {specialIds.map((i) => skinButton(i))}
                </div>
              </>
            ) : null}
            {previewSkin !== null ? (
              <div className={styles.buyPanel} role="group" aria-label={t("rubies.preview")}>
                <SkinPreview skinId={previewSkin} size={84} />
                <div className={styles.buyInfo}>
                  <strong>{t(`skins.${previewSkin}`)}</strong>
                  {(() => {
                    const price = priceOf(previewSkin);
                    const missing = Math.max(0, price - (me?.rubies ?? 0));
                    if (confirming) {
                      return (
                        <>
                          <span>{t("rubies.confirmText", { name: t(`skins.${previewSkin}`), price })}</span>
                          <div className={styles.buyButtons}>
                            <button type="button" className={styles.primary} disabled={buying} onClick={() => void buy(previewSkin)}>
                              {buying ? t("rubies.buying") : t("rubies.confirm")}
                            </button>
                            <button type="button" className={styles.secondary} disabled={buying} onClick={() => setConfirming(false)}>
                              {t("rubies.cancel")}
                            </button>
                          </div>
                        </>
                      );
                    }
                    return (
                      <>
                        <div className={styles.buyButtons}>
                          <button type="button" className={styles.primary} disabled={missing > 0 || !me} onClick={() => setConfirming(true)}>
                            {t("rubies.buy", { price })} <RubyIcon size={14} />
                          </button>
                          <button type="button" className={styles.secondary} onClick={() => setPreviewSkin(null)}>
                            {t("rubies.cancel")}
                          </button>
                        </div>
                        {missing > 0 && me ? <span className={styles.missing}>{t("rubies.missing", { count: missing })}</span> : null}
                      </>
                    );
                  })()}
                  {buyError ? <span className={styles.error}>{t(`rubies.errors.${buyError}`)}</span> : null}
                </div>
              </div>
            ) : null}

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

            {entryBonus > 0 ? <p className={styles.notice}>{t("status.entryBonus", { count: entryBonus })}</p> : null}
            {notice === "skinLocked" ? <p className={styles.error}>{t("status.skinLocked")}</p> : null}
            {notice === "expired" ? <p className={styles.notice}>{t("status.expired")}</p> : null}
            {status === "resuming" ? <p className={styles.notice}>{t("status.resuming")}</p> : null}
            {status === "full" ? <p className={styles.error}>{t("status.full")}</p> : null}
            {status === "afk" ? <p className={styles.error}>{t("status.afk")}</p> : null}
            {status === "taken" ? <p className={styles.error}>{t("status.taken")}</p> : null}
            {status === "error" ? <p className={styles.error}>{t("status.error")}</p> : null}

            <div className={styles.cardButtons}>
              {status === "error" || status === "afk" || status === "full" || status === "taken" ? (
                <button type="button" className={styles.primary} onClick={() => setAttempt((n) => n + 1)}>
                  {t("retry")}
                </button>
              ) : (
                <button type="button" className={styles.primary} onClick={play} disabled={status !== "ready"}>
                  {status === "ready" ? t("play") : status === "resuming" ? t("resuming") : t("connecting")}
                </button>
              )}
              <button type="button" className={styles.secondary} onClick={handleClose}>
                {t("close")}
              </button>
            </div>
            <FlockInvite arenaId={arenaId} className={styles.lobbyInvite} direction="up" />
          </div>
        </div>
      ) : null}
    </div>
  );
}
