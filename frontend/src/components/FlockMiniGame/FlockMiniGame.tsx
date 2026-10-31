"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { suspendAppBackground } from "@/lib/appBackgroundStore";
import { useFullscreenMode } from "@/contexts/TabBarOverlayContext";
import { useLocale, useTranslations } from "next-intl";
import { ChevronDown, Crown, Lock, X } from "lucide-react";
import RubyIcon from "@/components/RubyIcon/RubyIcon";
import { EagleEyeIcon, PipeIcon, StarfallIcon, WindIcon } from "@/components/icons/game";
import { FREE_SKIN_ROWS, HIDDEN_SKIN_IDS, isPaidSkin, isPremiumSkin, isSelectableSkin, isSpecialSkin, PAID_SKIN_IDS, PREMIUM_SKIN_IDS, SPECIAL_SKIN_IDS } from "@/lib/rubies";
import { visibleSkinIds } from "./flockSkinVisibility";
import { getDirectApiOrigin } from "@/lib/apiBase";
import { getAuthToken } from "@/lib/auth";
import { ensureAccessToken } from "@/lib/authSession";
import { FlockClient, type CircleEndInfo, type DeathInfo, type FlockMode, type FlockNotice, type FlockStatus, type RewardInfo } from "./flockClient";
import { buyFlockArtifact, buyFlockSkin, fetchFlockMe, FlockApiError, importFlockStats, markWhatsNewSeen, selectFlockArtifact, selectFlockSkin, type FlockMe } from "./flockApi";
import { ARTIFACT_IDS, artifactIconSrc, drawArtifact } from "./flockArtifacts";
import { artifactDescParams } from "./flockInfoData";
import { PERK_ICON, perkList, perksOf } from "./flockSkinPerks";
import FlockInvite from "./FlockInvite";
import { CUSTOM_COOLDOWN_MS, CUSTOM_MAX_LEN, loadHidePhrases, PHRASES, saveHidePhrases, toPhraseLang } from "./flockPhrases";
import { isResumable, loadFlockSession } from "./flockSession";
import FlockDailyBoard from "./FlockDailyBoard";
import FlockInfo from "./FlockInfo";
import FlockModes from "./FlockModes";
import FlockCastlesLobby from "./FlockCastlesLobby";
import FlockCastleHud, { CastleEndCard, type CastleHudData } from "./FlockCastleHud";
import type { CastleEndInfo, CastleEvent, CastleRewardInfo, CastlesGameConfig, Team } from "./flockCastles";
import castleStyles from "./FlockCastles.module.scss";
import FlockSheet from "./FlockSheet";
import FlockSoundSettings, { FlockSoundButton } from "./FlockSoundSettings";
import { installFlockSoundUnlock, playFlockSound, setFlockMusic, setFlockSoundPaused, setFlockSoundRunning } from "./flockSound";
import { resetFlockSoundLoops, tickFlockSound } from "./flockSoundDirector";
import FlockWhatsNew from "./FlockWhatsNew";
import { decideAnnouncement, loadLocalSeen, saveLocalSeen, type Announcement } from "./flockWhatsNewLogic";
import { joystickDir, inputChanged, pointerDir, type Dir } from "./flockInputMath";
import { drawMinimap, drawScene, THEMES, drawCreature, BONUS_ICON, type Theme } from "./flockRender";
import { animFrame, skinOf } from "./flockSkins";
import { isSpecialDeco } from "./flockSpecialDeco";
import { prefersReducedMotion } from "./flockSprites";
import { subscribePreviewTick } from "./flockPreviewTicker";
import {
  clearLegacyFlockStats,
  EMPTY_FLOCK_STATS,
  loadLegacyFlockStats,
  type FlockStats,
} from "./flockStats";
import styles from "./FlockMiniGame.module.scss";

const BOARD_COLLAPSED_KEY = "christapp:flockBoardCollapsed";

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
  /** Держатель серії днів на 1-му місці (pid на арені) і скільки днів. */
  streak: { pid: number; days: number } | null;
  selfPid: number;
  effects: { kind: string; remainingMs: number; totalMs: number }[];
  arenaId: number | null;
  /** «Прискорення»: сервер його підтримує, зараз достатньо маси (кнопка активна) і воно діє просто зараз. */
  sprintSupported: boolean;
  sprintReady: boolean;
  sprintActive: boolean;
  /** Режим «Звужуване коло»: стадія/фаза кола (null - звичайна арена). */
  circle: { phase: "warmup" | "hold" | "shrink" | "final"; leftMs: number; stage: number; stages: number } | null;
  /** «Вітер»: попередження (warn) або снос (active) з напрямком (рад); null - вітру нема. */
  wind: { phase: "warn" | "active"; angle: number } | null;
  /** Своя клітина зараз під «Сопілкою пастуха» (коротка підказка «Тебе кличе сопілка!»). */
  pipeCalled: boolean;
  /** Режим «Замки»: шапка матчу (null - інший режим або ще нема `cm`). */
  castle: CastleHudData | null;
};

/** Ключи названий карт (flock.mapNames) по номеру карты FLOCK_MAPS. */
const MAP_KEYS = ["meadow", "grove", "frost", "volcano", "lake"] as const;

const EMPTY_HUD: Hud = { total: 0, rank: 0, alive: 0, top: [], streak: null, selfPid: 0, effects: [], arenaId: null, sprintSupported: false, sprintReady: false, sprintActive: false, circle: null, wind: null, pipeCalled: false, castle: null };
const MINIMAP_SIZE = 96;
const SKIN_KEY = "christapp:flock:skin";
/** Дзеркало FLOCK_CONFIG.phrases.cooldownMs на сервері (лише для сірих кнопок; ліміт тримає сервер). */
const PHRASE_COOLDOWN_MS = 3000;

function currentTheme(): Theme {
  if (typeof document === "undefined") return THEMES.dark;
  return document.documentElement.dataset.theme === "light" ? THEMES.light : THEMES.dark;
}

function loadSkin() {
  try {
    const v = Number(localStorage.getItem(SKIN_KEY));
    return isSelectableSkin(v) ? v : 0;
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
function SkinPreview({ skinId, artifactId = 0, size = 56 }: { skinId: number; artifactId?: number; size?: number }) {
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
      if (artifactId > 0) drawArtifact(ctx, artifactId, skin, size / 2, size / 2 + 1, radius, 0.5);
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
  }, [skinId, artifactId, size]);
  return <canvas ref={ref} style={{ width: size, height: size }} aria-hidden />;
}

export default function FlockMiniGame({ open, userId, arenaId = null, onClose }: Props) {
  // Навбар і лампочка теми не потрібні на арені — ні на маршруті /games/flock, ні в модалці з чату.
  useFullscreenMode(open);
  // «Отара» рисует свою сцену: корневой фон приложения на это время не показываем.
  useEffect(() => (open ? suspendAppBackground() : undefined), [open]);

  const t = useTranslations("flock");
  const locale = useLocale();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const miniRef = useRef<HTMLCanvasElement | null>(null);
  const stickBaseRef = useRef<HTMLDivElement | null>(null);
  const stickKnobRef = useRef<HTMLDivElement | null>(null);
  const clientRef = useRef<FlockClient | null>(null);
  const dirRef = useRef<Dir>({ angle: 0, power: 0 });
  const throwHeldRef = useRef(false);
  const splitQueuedRef = useRef(false);
  /** Кнопка / Shift «Прискорення» утримується. */
  const sprintHeldRef = useRef(false);
  const stepInputRef = useRef({ angle: 0, power: 0, sprint: false });
  const sprintSentRef = useRef(false);
  /** Палец, держащий кнопку «Прискорення»: кнопка может стать неактивной (мало массы) и не получить pointerup - отпускаем по окну. */
  const sprintPointerRef = useRef<number | null>(null);
  const lastSentRef = useRef<{ dir: Dir; at: number } | null>(null);
  const themeRef = useRef<Theme>(currentTheme());
  const stickRef = useRef<{ id: number; bx: number; by: number } | null>(null);
  const maxTotalRef = useRef(0);
  const aspectRef = useRef(1);

  const [status, setStatus] = useState<FlockStatus>("connecting");
  const [skin, setSkin] = useState(0);
  const [stats, setStats] = useState<FlockStats>(EMPTY_FLOCK_STATS);
  const [me, setMe] = useState<FlockMe | null>(null);
  const [previewSkin, setPreviewSkin] = useState<number | null>(null);
  /** Надетый артефакт (0 - нет): хранится на сервере, выбирается независимо от скина. */
  const [artifact, setArtifact] = useState(0);
  const [previewArtifact, setPreviewArtifact] = useState<number | null>(null);
  const [artifactConfirming, setArtifactConfirming] = useState(false);
  const [artifactBusy, setArtifactBusy] = useState(false);
  const [artifactError, setArtifactError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [buying, setBuying] = useState(false);
  const [buyError, setBuyError] = useState<string | null>(null);
  /** Напис «Зорепад!» (id - щоб анімація стартувала знову при повторі події). */
  const [zorepad, setZorepad] = useState<number | null>(null);
  const [scissorsMsg, setScissorsMsg] = useState<{ id: number; taker: boolean; count: number; gain: number } | null>(null);
  /** Подсказка при подборе «Орлиного зору» (id - чтобы анимация стартовала снова). */
  const [eagleHint, setEagleHint] = useState<number | null>(null);
  /** Підказка при підборі «Сопілки пастуха» і назва карти при вході (3 с). */
  const [pipeHint, setPipeHint] = useState<number | null>(null);
  const [mapToast, setMapToast] = useState<string | null>(null);
  const [reviveMsg, setReviveMsg] = useState<number | null>(null);
  const [bossMsg, setBossMsg] = useState<{ id: number; kind: 1 | 2 | 3; name: string } | null>(null);
  const [reward, setReward] = useState<(RewardInfo & { id: number }) | null>(null);
  const [death, setDeath] = useState<DeathInfo | null>(null);
  const [hud, setHud] = useState<Hud>(EMPTY_HUD);
  /** «Режими» (окно в лобби), подведение итогов раунда «Звужуване коло» и «раунд ещё идёт» для мёртвого. */
  const [modesOpen, setModesOpen] = useState(false);
  const [circleEnd, setCircleEnd] = useState<(CircleEndInfo & { at: number }) | null>(null);
  /** «Замки»: лобі режиму, підсумок матчу, нагорода, напис події, помилка входу. */
  const [castlesOpen, setCastlesOpen] = useState(false);
  const [castleEnd, setCastleEnd] = useState<CastleEndInfo | null>(null);
  const [castleReward, setCastleReward] = useState<CastleRewardInfo | null>(null);
  const [castleToast, setCastleToast] = useState<{ id: number; text: string; good: boolean } | null>(null);
  const [roundWait, setRoundWait] = useState<{ ms: number; at: number } | null>(null);
  /** Текущее время для секунд на карточке итогов и подсказке «раунд ещё идёт» (обновляется таймером, не при рендере). */
  const [nowMs, setNowMs] = useState(0);
  const [isTouch, setIsTouch] = useState(false);
  /** «Топ-10» згорнуто в плашку: вибір зберігається локально, за замовчуванням - згорнуто на телефоні й розгорнуто на ПК. */
  const [boardCollapsed, setBoardCollapsed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [notice, setNotice] = useState<FlockNotice>(null);
  /** Разовый бонус за первый вход (показывается один раз в лобби). */
  const [entryBonus, setEntryBonus] = useState(0);
  /** Нагорода за колекцію преміум: з входу (/me) или з покупки последнего скина. */
  const [collectionAward, setCollectionAward] = useState<{ amount: number; fromBuy: boolean } | null>(null);
  const [streakAward, setStreakAward] = useState(0);
  const [streakAwardDay, setStreakAwardDay] = useState(0);
  const [reconnectLeft, setReconnectLeft] = useState(0);
  const [announcement, setAnnouncement] = useState<Announcement | null>(null);
  const announcedRef = useRef(false);
  /** Шторка «Про гру» (кнопка «i») и раздел «Артефакти» в лобби: оба каждый раз стартуют свёрнутыми / закрытыми. */
  const [phrasesOpen, setPhrasesOpen] = useState(false);
  /** Пауза між фразами (дзеркало серверного ліміту): кнопки сіріють, щоб не здавалось, що фраза "не пішла". */
  const [phraseCooldown, setPhraseCooldown] = useState(false);
  const [hideOthersPhrases, setHideOthersPhrases] = useState(false);
  /** Свій текст: поле вводу, пауза між повідомленнями, відмова сервера й висота клавіатури (visualViewport). */
  const [customText, setCustomText] = useState("");
  const [customCooldown, setCustomCooldown] = useState(false);
  const [sayNotice, setSayNotice] = useState<string | null>(null);
  const [kbInset, setKbInset] = useState(0);
  const typingRef = useRef(false);
  const customInputRef = useRef<HTMLInputElement | null>(null);
  const hideOthersPhrasesRef = useRef(false);
  const phraseLangRef = useRef(toPhraseLang(locale));
  phraseLangRef.current = toPhraseLang(locale);
  const [infoOpen, setInfoOpen] = useState(false);
  const [artifactsOpen, setArtifactsOpen] = useState(false);
  const [soundOpen, setSoundOpen] = useState(false);
  /** Версия «Що нового», просмотренная ДО этого открытия игры (для точки «Нове» во вкладке «Оновлення»). */
  const seenBeforeRef = useRef<number | null>(null);
  const resumableAtOpenRef = useRef(false);

  // «Що нового» / «Ласкаво просимо»: решаем один раз за открытие, когда пришёл профиль с сервера.
  useEffect(() => {
    if (!open) {
      announcedRef.current = false;
      seenBeforeRef.current = null;
      setAnnouncement(null);
      setInfoOpen(false);
      setArtifactsOpen(false);
      setSoundOpen(false);
      return;
    }
    resumableAtOpenRef.current = isResumable(loadFlockSession());
  }, [open]);
  // звук: контекст создаётся первым касанием; пока игра закрыта - приостановлен
  useEffect(() => {
    if (!open) return;
    setFlockSoundRunning(true);
    const off = installFlockSoundUnlock();
    return () => {
      off();
      resetFlockSoundLoops();
      setFlockSoundRunning(false);
    };
  }, [open]);
  const onUpdatesViewed = useCallback(
    (version: number) => {
      saveLocalSeen(userId, version);
      void markWhatsNewSeen(version).catch(() => undefined);
      setMe((m) => (m ? { ...m, whatsNewSeen: Math.max(m.whatsNewSeen ?? 0, version) } : m));
    },
    [userId],
  );
  const lobbyClickSound = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest?.("button")) playFlockSound("click", { self: true });
  }, []);
  const closeInfo = useCallback(() => setInfoOpen(false), []);
  const closeArtifacts = useCallback(() => setArtifactsOpen(false), []);

  // запоминаем «просмотрено» до того, как плашка ниже пометит версию как просмотренную
  useEffect(() => {
    if (!open || !me || seenBeforeRef.current !== null) return;
    seenBeforeRef.current = Math.max(me.whatsNewSeen ?? 0, loadLocalSeen(userId));
  }, [open, me, userId]);
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
    const coarse = window.matchMedia?.("(pointer: coarse)").matches ?? false;
    setIsTouch(coarse);
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(BOARD_COLLAPSED_KEY);
    } catch {
      /* сховище недоступне - беремо значення за замовчуванням */
    }
    setBoardCollapsed(stored === null ? coarse : stored === "1");
  }, [userId]);

  const toggleBoard = useCallback(() => {
    setBoardCollapsed((prev) => {
      try {
        localStorage.setItem(BOARD_COLLAPSED_KEY, prev ? "0" : "1");
      } catch {
        /* не критично: стан просто не запам'ятається */
      }
      return !prev;
    });
  }, []);

  /** Баланс, куплені скіни й статистика - з сервера; стара статистика з localStorage переноситься один раз. */
  const castlesNumsRef = useRef<CastlesGameConfig>({});
  const castlesNums = ((me?.config.game as Record<string, unknown> | undefined)?.castles ?? {}) as CastlesGameConfig;
  castlesNumsRef.current = castlesNums;
  /** «Замки»: події тіку -> звук і напис (звуки лише наявні). Ref, щоб клієнт не тримав застарілий замикання. */
  const handleCastleEventsRef = useRef<(events: CastleEvent[], team: Team | 0, pid: number) => void>(() => undefined);
  handleCastleEventsRef.current = (events, team, pid) => {
    for (const e of events) {
      const good = e.t === team;
      let key: string | null = null;
      let ok = good;
      switch (e.k) {
        case "steal":
          key = good ? "toast.stealMine" : "toast.stealEnemy";
          playFlockSound(good ? "bonus" : "eaten", { self: true });
          break;
        case "deliver":
          key = good ? "toast.deliverMine" : "toast.deliverEnemy";
          playFlockSound(good ? "coins" : "eaten", { self: true });
          break;
        case "drop":
          // t - команда вора: його ловлять
          key = good ? "toast.dropMine" : "toast.dropEnemy";
          ok = !good;
          playFlockSound(good ? "eaten" : "bonus", { self: true });
          break;
        case "return":
          key = "toast.returned";
          playFlockSound("bonusEnd", { self: true });
          break;
        case "castle":
          // t - команда, чий замок зруйновано
          key = good ? "toast.castleMine" : "toast.castleEnemy";
          ok = !good;
          playFlockSound(good ? "death" : "revive", { self: true });
          break;
        default:
          break;
      }
      void pid;
      if (key) setCastleToast({ id: Date.now() + Math.random(), text: t(`castles.${key}`, { damage: castlesNums.damage ?? "…" }), good: ok });
    }
  };
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
      if (data.premiumCollection) setCollectionAward({ amount: data.premiumCollection, fromBuy: false });
      if (data.streakAward) {
        setStreakAward(data.streakAward);
        setStreakAwardDay(data.streakAwardDay ?? 0);
      }
      setStats(data.stats);
      // обраний скін мусить бути доступним (безкоштовний або куплений)
      setSkin((cur) => (!isSelectableSkin(cur) || (isPaidSkin(cur) && !data.ownedSkins.includes(cur)) ? 0 : cur));
      setArtifact(data.selectedArtifact ?? 0);
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
        onCircleEnd: (info) => setCircleEnd({ ...info, at: Date.now() }),
        onCircleStart: () => setCircleEnd(null),
        onRoundWait: (ms) => setRoundWait({ ms, at: Date.now() }),
        onCastleEvents: (events, team, pid) => handleCastleEventsRef.current(events, team, pid),
        onCastleEnd: (info) => {
          setCastleEnd(info);
          setCastleReward(null);
        },
        onCastleReward: (info) => {
          setCastleReward(info);
          if (typeof info.balance === "number") setMe((m) => (m ? { ...m, rubies: info.balance as number } : m));
        },
        onCastleStart: () => {
          setCastleEnd(null);
          setCastleReward(null);
        },
        onStatus: (s) => setStatus(s),
        onZorepad: () => setZorepad(Date.now()),
        onSayRejected: (reason) => setSayNotice(t(`phrases.rejected.${reason}`)),
        onBoss: (e) => setBossMsg({ id: Date.now(), kind: e.kind, name: e.name }),
        onScissors: (r) => setScissorsMsg({ id: Date.now(), taker: r.taker, count: r.count, gain: r.gain }),
        onRevive: () => setReviveMsg(Date.now()),
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

  const play = useCallback((mode?: FlockMode) => {
    try {
      localStorage.setItem(SKIN_KEY, String(skin));
    } catch {
      /* ignore */
    }
    maxTotalRef.current = 0;
    setDeath(null);
    setReward(null);
    if (isPaidSkin(skin)) void selectFlockSkin(skin).catch(() => undefined);
    setCircleEnd(null);
    setRoundWait(null);
    setModesOpen(false);
    clientRef.current?.join(skin, me?.ownedArtifacts?.includes(artifact) ? artifact : 0, mode, perksOf(me?.config.game, skin));
  }, [skin, artifact, me]);

  /** «Замки»: вхід у матч за обраними стороною й скіном (платні скіни й артефакти в режимі не діють). */
  const playCastles = useCallback((team: Team, skinId: number) => {
    maxTotalRef.current = 0;
    setDeath(null);
    setReward(null);
    setCircleEnd(null);
    setRoundWait(null);
    setCastleEnd(null);
    setCastleReward(null);
    setModesOpen(false);
    setCastlesOpen(false);
    clientRef.current?.join(skinId, 0, "castles", {}, team);
  }, []);

  // секунды на карточке итогов и в подсказке «раунд ещё идёт» тикают раз в 500 мс
  useEffect(() => {
    if (!circleEnd && !roundWait) return;
    setNowMs(Date.now());
    const id = setInterval(() => setNowMs(Date.now()), 500);
    return () => clearInterval(id);
  }, [circleEnd, roundWait]);

  const eagleOn = hud.effects.some((e) => e.kind === "eagle");
  const eagleWasOn = useRef(false);
  useEffect(() => {
    if (eagleOn && !eagleWasOn.current) setEagleHint(Date.now());
    eagleWasOn.current = eagleOn;
  }, [eagleOn]);
  const pipeOn = hud.effects.some((e) => e.kind === "pipe");
  const pipeWasOn = useRef(false);
  useEffect(() => {
    if (pipeOn && !pipeWasOn.current) setPipeHint(Date.now());
    pipeWasOn.current = pipeOn;
  }, [pipeOn]);
  useEffect(() => {
    if (pipeHint === null) return;
    const id = setTimeout(() => setPipeHint(null), 2600);
    return () => clearTimeout(id);
  }, [pipeHint]);
  // назва карти на 3 с при кожному вході на арену (за id арени, а не за кадром)
  const entryArenaId = hud.arenaId;
  useEffect(() => {
    if (entryArenaId === null) return;
    const map = clientRef.current?.model?.cfg.map ?? 0;
    setMapToast(MAP_KEYS[map] ?? MAP_KEYS[0]);
    const id = setTimeout(() => setMapToast(null), 3000);
    return () => clearTimeout(id);
  }, [entryArenaId]);
  useEffect(() => {
    if (eagleHint === null) return;
    const id = setTimeout(() => setEagleHint(null), 2600);
    return () => clearTimeout(id);
  }, [eagleHint]);

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

  useEffect(() => {
    if (reviveMsg === null) return;
    const id = setTimeout(() => setReviveMsg(null), 2600);
    return () => clearTimeout(id);
  }, [reviveMsg]);

  useEffect(() => {
    if (bossMsg === null) return;
    const id = setTimeout(() => setBossMsg(null), 3200);
    return () => clearTimeout(id);
  }, [bossMsg]);

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
      setMe((m) => (m ? { ...m, rubies: res.rubies, ownedSkins: [...m.ownedSkins, i].sort((a, b) => a - b), premiumCollectionClaimed: m.premiumCollectionClaimed || Boolean(res.premiumCollection) } : m));
      if (res.premiumCollection) setCollectionAward({ amount: res.premiumCollection, fromBuy: true });
      setSkin(i);
      playFlockSound("coins", { self: true });
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

  const ownedArtifacts = me?.ownedArtifacts ?? [];
  const artifactPrice = me?.config.artifactPrice ?? 350;
  const artifactParams = artifactDescParams(me?.config.game);

  /** Тап по плитке: купленный - надеть/снять, не купленный - панель покупки. */
  const openArtifact = (id: number) => {
    setArtifactError(null);
    setArtifactConfirming(false);
    if (!ownedArtifacts.includes(id)) {
      setPreviewArtifact(id);
      return;
    }
    setPreviewArtifact(null);
    wearArtifact(artifact === id ? 0 : id);
  };

  const wearArtifact = (id: number) => {
    setArtifact(id);
    void selectFlockArtifact(id).catch(() => void refreshMe());
  };

  const buyArtifact = async (id: number) => {
    setArtifactBusy(true);
    setArtifactError(null);
    try {
      const res = await buyFlockArtifact(id);
      setMe((m) => (m ? { ...m, rubies: res.rubies, ownedArtifacts: [...(m.ownedArtifacts ?? []), id].sort((a, b) => a - b) } : m));
      playFlockSound("coins", { self: true });
      setPreviewArtifact(null);
      setArtifactConfirming(false);
      wearArtifact(id);
    } catch (e) {
      const code = e instanceof FlockApiError ? e.code : null;
      setArtifactError(code === "not_enough" || code === "already_owned" ? code : "generic");
      if (code === "already_owned" || code === "not_enough") void refreshMe();
      setArtifactConfirming(false);
    } finally {
      setArtifactBusy(false);
    }
  };

  // скрытые скины (сервер: config.hiddenSkins) не показываем, пока профиль не загружен - тоже; купленные остаются
  const hiddenSkins = me ? (me.config.hiddenSkins ?? []) : HIDDEN_SKIN_IDS;
  const ownedSkins = me?.ownedSkins ?? null;
  const paidIds = visibleSkinIds(PAID_SKIN_IDS, hiddenSkins, ownedSkins);
  const specialIds = visibleSkinIds(SPECIAL_SKIN_IDS, hiddenSkins, ownedSkins);
  /** Премиум-скины, которые сейчас в продаже (без снятых): их надо собрать для награды. */
  const collectionIds = PREMIUM_SKIN_IDS.filter((id) => !hiddenSkins.includes(id));
  /** Ряд без пустых ячеек: колонок ровно столько, сколько скинов (но не больше 6). */
  const rowCols = (ids: readonly number[]) => ({ gridTemplateColumns: `repeat(${Math.min(6, Math.max(1, ids.length))}, 1fr)` });

  /** Ряды по шесть; в неполном последнем ряду колонок ровно столько, сколько скинов (без пустых ячеек). */
  const splitRows = (ids: readonly number[]): number[][] => {
    const rows: number[][] = [];
    for (let k = 0; k < ids.length; k += 6) rows.push(ids.slice(k, k + 6));
    return rows;
  };
  /** Премиум-скины (видимые) рядами по шесть без пустых ячеек: 11 -> 6 + 5. */
  const premiumRows = splitRows(visibleSkinIds(PREMIUM_SKIN_IDS, hiddenSkins, ownedSkins));

  const priceOf = (i: number) =>
    isSpecialSkin(i) ? (me?.config.specialSkinPrice ?? 150) : isPremiumSkin(i) ? (me?.config.premiumSkinPrice ?? 200) : (me?.config.skinPrice ?? 50);

  /** Строки бонуса скина с иконкой («+10% радіус підбору»). */
  const perkLines = (id: number) => {
    const list = perkList(me?.config.game, id);
    if (list.length === 0) return null;
    return (
      <ul className={styles.perkLines}>
        {list.map((p) => (
          <li key={p.key}>
            <span aria-hidden>{PERK_ICON[p.key]}</span> {t(`perks.${p.key}`, { v: p.value })}
          </li>
        ))}
      </ul>
    );
  };

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
        {isSpecialSkin(i) && perkList(me?.config.game, i).length > 0 ? (
          <span className={styles.perkBadge} title={t("premiumCollection.perkBadge")} aria-hidden>
            +
          </span>
        ) : null}
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
    setFlockSoundPaused(reconnecting);
  }, [reconnecting]);
  // музыка играет при входе в «Отару» (лобби, экран после смерти) и затихает, пока идёт сама игра
  useEffect(() => {
    setFlockMusic(open && !playing);
    return () => setFlockMusic(false);
  }, [open, playing]);

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
      const stepInput = stepInputRef.current;
      stepInput.angle = dirRef.current.angle;
      stepInput.power = dirRef.current.power;
      stepInput.sprint = sprintHeldRef.current;
      model.step(dt, stepInput, now);
      tickFlockSound(model, now);
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
        phraseLang: phraseLangRef.current,
        hideOthersPhrases: hideOthersPhrasesRef.current,
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
        streak: model.streak,
        selfPid: model.cfg.pid,
        arenaId: model.cfg.arenaId,
        effects: model.effects.map((e) => ({ ...e })),
        sprintSupported: Boolean(model.cfg.speed.sprint),
        sprintReady: model.sprintReady(),
        sprintActive: model.sprintActive,
        circle: model.cfg.mode === "circle" ? model.circleStatus(performance.now()) : null,
        wind: (() => {
          const w = model.windStatus(performance.now());
          return w ? { phase: w.phase, angle: w.angle } : null;
        })(),
        pipeCalled: performance.now() - model.pipeCalledAt < 1500,
        castle: (() => {
          const cs = model.castle;
          const cc = model.cfg.castle;
          if (!cc) return null;
          const now = performance.now();
          return {
            ph: cs?.ph ?? 0,
            leftMs: model.castleLeftMs(now),
            sc: cs?.sc ?? [0, 0],
            hp: cs?.hp ?? [100, 100],
            hpMax: cs?.hpMax ?? 100,
            st: cs?.st ?? [0, 0],
            hu: cs?.hu ?? [0, 0],
            team: cc.team,
            carrying: model.carryingStone(),
            sp: cs?.sp ?? 0,
            rsMs: model.castleRespawnMs(now),
            nums: castlesNumsRef.current,
          };
        })(),
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
      // пока «Прискорення» утримується - шлём ввод каждый такт (сервер держит его ~0.45 с после последнего пакета)
      const sprint = sprintHeldRef.current;
      const sprintChanged = sprint !== sprintSentRef.current;
      if (split || thr || sprint || sprintChanged || inputChanged(prev?.dir ?? null, dir, prev ? nowMs - prev.at : 1e9)) {
        sprintSentRef.current = sprint;
        client.sendInput(dir, split, thr, aspectRef.current, sprint);
        lastSentRef.current = { dir: { ...dir }, at: nowMs };
      }
    }, 100);

    return () => {
      cancelAnimationFrame(raf);
      resetFlockSoundLoops();
      ro.disconnect();
      clearInterval(hudTimer);
      clearInterval(sendTimer);
    };
  }, [open, playing]);

  // клавіатура: пробіл - розділитись, W - кинути
  useEffect(() => {
    if (!open) return;
    const down = (e: KeyboardEvent) => {
      // у полі свого тексту пробіл/W/T - звичайні літери, а не «розділитись»/«кинути»/панель; Escape закриває панель
      const el0 = e.target as HTMLElement | null;
      if (el0 && (el0.tagName === "INPUT" || el0.tagName === "TEXTAREA" || el0.isContentEditable)) {
        if (e.code === "Escape" && playing) setPhrasesOpen(false);
        return;
      }
      if (e.code === "Space") {
        e.preventDefault();
        if (!e.repeat) splitQueuedRef.current = true;
      } else if (e.code === "KeyW") {
        throwHeldRef.current = true;
      } else if (e.code === "ShiftLeft" || e.code === "ShiftRight") {
        sprintHeldRef.current = true;
      } else if (e.code === "KeyT" && playing && !e.repeat && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const el = e.target as HTMLElement | null;
        if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
        setPhrasesOpen((v) => !v);
      } else if (e.code === "Escape" && playing) {
        setPhrasesOpen(false);
      } else if (e.code === "Escape" && !playing) {
        handleClose();
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === "KeyW") throwHeldRef.current = false;
      if (e.code === "ShiftLeft" || e.code === "ShiftRight") sprintHeldRef.current = false;
    };
    // окно потеряло фокус - keyup может не прийти: отпускаем рывок
    const release = () => {
      sprintHeldRef.current = false;
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    const releasePointer = (e: PointerEvent) => {
      if (e.pointerId === sprintPointerRef.current) {
        sprintPointerRef.current = null;
        sprintHeldRef.current = false;
      }
    };
    window.addEventListener("blur", release);
    window.addEventListener("pointerup", releasePointer);
    window.addEventListener("pointercancel", releasePointer);
    return () => {
      window.removeEventListener("pointerup", releasePointer);
      window.removeEventListener("pointercancel", releasePointer);
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", release);
      sprintHeldRef.current = false;
    };
  }, [open, playing, handleClose]);

  // збережена настройка «Ховати чужі фрази»
  useEffect(() => {
    if (!open) return;
    const v = loadHidePhrases();
    hideOthersPhrasesRef.current = v;
    setHideOthersPhrases(v);
  }, [open]);

  // панель фраз живе лише під час гри
  useEffect(() => {
    if (!playing) setPhrasesOpen(false);
  }, [playing]);

  // клавіатура на телефоні: панель стоїть над нею (visualViewport), керування вимкнене, поки поле у фокусі
  useEffect(() => {
    if (!phrasesOpen) {
      typingRef.current = false;
      setKbInset(0);
      customInputRef.current?.blur();
      return;
    }
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => setKbInset(Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop)));
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, [phrasesOpen]);

  useEffect(() => {
    if (sayNotice === null) return;
    const id = setTimeout(() => setSayNotice(null), 3200);
    return () => clearTimeout(id);
  }, [sayNotice]);

  const submitCustom = (e: React.FormEvent) => {
    e.preventDefault();
    const text = customText.replace(/\s+/g, " ").trim();
    if (!text || customCooldown) return;
    clientRef.current?.sendText(text);
    setCustomText("");
    setCustomCooldown(true);
    setTimeout(() => setCustomCooldown(false), CUSTOM_COOLDOWN_MS);
    // після відправки панель закривається, клавіатура ховається, керування повертається
    customInputRef.current?.blur();
    typingRef.current = false;
    setPhrasesOpen(false);
  };

  const sendPhrase = (id: number) => {
    setPhrasesOpen(false);
    if (phraseCooldown) return;
    clientRef.current?.sendPhrase(id);
    setPhraseCooldown(true);
    setTimeout(() => setPhraseCooldown(false), PHRASE_COOLDOWN_MS);
  };

  const toggleHidePhrases = (v: boolean) => {
    hideOthersPhrasesRef.current = v;
    setHideOthersPhrases(v);
    saveHidePhrases(v);
  };

  // жести на канвасі
  const onPointer = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (typingRef.current && e.pointerType !== "mouse") return; // клавіатура відкрита: джойстик вимкнено
    const r = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - r.left;
    const py = e.clientY - r.top;
    if (e.pointerType !== "mouse") {
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
    dirRef.current = pointerDir(px, py, r.width / 2, r.height / 2);
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (typingRef.current && e.pointerType !== "mouse") return; // клавіатура відкрита: джойстик вимкнено
    e.currentTarget.setPointerCapture?.(e.pointerId);
    if (e.pointerType !== "mouse") {
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
          {reconnecting ? (
            <div className={styles.reconnect} role="status">
              <span className={styles.spinner} aria-hidden />
              <span>{t("reconnecting", { seconds: reconnectLeft })}</span>
            </div>
          ) : null}
          {sayNotice ? (
            <div className={styles.sayNotice} role="status">
              {sayNotice}
            </div>
          ) : null}
          {eagleHint !== null ? (
            <div key={eagleHint} className={styles.eagleBanner} role="status">
              <EagleEyeIcon size={30} /> {t("events.eagle", { sec: Math.round((hud.effects.find((e) => e.kind === "eagle")?.totalMs ?? 10000) / 1000) })}
            </div>
          ) : null}
          {pipeHint !== null ? (
            <div key={pipeHint} className={styles.eagleBanner} role="status">
              <PipeIcon size={30} /> {t("pipe.hint")}
            </div>
          ) : null}
          {hud.pipeCalled ? (
            <div className={styles.pipeCall} role="status">
              {t("pipe.pull")}
            </div>
          ) : null}
          {hud.wind ? (
            <div className={`${styles.windBanner} ${hud.wind.phase === "warn" ? styles.windWarn : styles.windChip}`} role="status">
              <span className={styles.windArrow} style={{ transform: `rotate(${hud.wind.angle}rad)` }} aria-hidden>
                ➜
              </span>
              <WindIcon size={hud.wind.phase === "warn" ? 28 : 20} /> {t("wind.warn")}
            </div>
          ) : null}
          {mapToast ? (
            <div key={entryArenaId} className={styles.mapToast} role="status">
              {t(`mapNames.${mapToast}`)}
            </div>
          ) : null}
          {zorepad !== null ? (
            <div key={zorepad} className={styles.zorepadBanner} role="status">
              <StarfallIcon size={40} /> {t("events.zorepad")}
            </div>
          ) : null}
          {scissorsMsg ? (
            <div key={scissorsMsg.id} className={styles.scissorsBanner} role="status">
              {scissorsMsg.taker ? t("events.scissorsTaker", { count: scissorsMsg.count, gain: scissorsMsg.gain }) : t("events.scissorsVictim")}
            </div>
          ) : null}
          {reviveMsg ? (
            <div key={reviveMsg} className={styles.scissorsBanner} role="status">
              {t("events.revived")}
            </div>
          ) : null}
          {bossMsg ? (
            <div key={bossMsg.id} className={`${styles.bossBanner} ${bossMsg.kind === 3 ? styles.bossBannerEat : ""}`} role="status">
              {bossMsg.kind === 1
                ? t("events.bossSpawn")
                : bossMsg.kind === 2
                  ? t("events.bossDefeated", { name: bossMsg.name })
                  : t("events.bossAteLeader", { name: bossMsg.name })}
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
          {hud.castle ? (
            <>
              <FlockCastleHud c={hud.castle} />
              {castleToast ? (
                <div key={castleToast.id} className={`${castleStyles.toast} ${castleToast.good ? castleStyles.toastGood : castleStyles.toastBad}`} role="status">
                  {castleToast.text}
                </div>
              ) : null}
            </>
          ) : null}
          {!hud.castle ? (
          <div className={styles.massBadge} aria-live="off">
            <span className={styles.massLabel}>{t("hud.mass")}</span>
            <span className={styles.massValue}>{Math.round(hud.total)}</span>
            <span className={styles.rank}>{rank}</span>
          </div>
          ) : null}

          {!hud.castle ? (
          <button
            type="button"
            className={`${styles.board} ${boardCollapsed ? styles.boardCollapsed : ""}`}
            aria-expanded={!boardCollapsed}
            title={t("hud.boardToggle")}
            onClick={toggleBoard}
          >
            <span className={styles.boardHead}>
              <span className={styles.boardTitle}>{t("hud.leaderboard")}</span>
              {boardCollapsed ? (
                <span className={styles.boardSummary}>
                  {hud.rank > 0 ? <span className={styles.boardSummaryRank}>{rank}</span> : null}
                  {hud.top[0] ? (
                    <>
                      <span className={styles.boardName}>{hud.top[0].name}</span>
                      <span className={styles.boardMass}>{Math.round(hud.top[0].mass)}</span>
                    </>
                  ) : null}
                </span>
              ) : null}
              <ChevronDown size={14} aria-hidden className={styles.boardChevron} />
            </span>
            {boardCollapsed ? null : (
            <span className={styles.boardRows}>
              {hud.top.map((p, i) => (
                <span key={p.pid} className={`${styles.boardRow} ${p.pid === hud.selfPid ? styles.me : ""}`}>
                  <span className={styles.boardPos}>{i + 1}.</span>
                  <span className={styles.boardName}>{p.name}</span>
                  {hud.streak && hud.streak.pid === p.pid ? (
                    <span className={styles.boardStreak} title={t("hud.streakTitle", { days: hud.streak.days })}>
                      <Crown size={11} aria-hidden /> {t("hud.streakDays", { days: hud.streak.days })}
                    </span>
                  ) : null}
                  <span className={styles.boardMass}>{Math.round(p.mass)}</span>
                </span>
              ))}
            </span>
            )}
          </button>
          ) : null}

          {hud.circle ? (
            <div className={styles.circleBanner} role="status" aria-live="polite">
              <strong>
                {hud.circle.phase === "warmup"
                  ? t("circle.warmup", { s: Math.ceil(hud.circle.leftMs / 1000) })
                  : hud.circle.phase === "hold"
                    ? t("circle.hold", { s: Math.ceil(hud.circle.leftMs / 1000) })
                    : hud.circle.phase === "shrink"
                      ? t("circle.shrinking", { s: Math.ceil(hud.circle.leftMs / 1000) })
                      : t("circle.final")}
              </strong>
              <span>{t("circle.alive", { n: hud.alive })}</span>
            </div>
          ) : null}

          <canvas ref={miniRef} className={styles.minimap} style={{ width: MINIMAP_SIZE, height: MINIMAP_SIZE }} aria-hidden />

          {hud.effects.length > 0 ? (
            <ul className={`${styles.effects} ${hud.circle ? styles.effectsBelowBanner : ""}`}>
              {hud.effects.map((e) => (
                <li
                  key={e.kind}
                  title={t(`bonuses.${e.kind}`)}
                  className={[e.kind === "boost" || e.kind === "freeze" ? styles.effectLabeled : "", e.kind === "eagle" ? styles.effectEagle : ""].filter(Boolean).join(" ") || undefined}
                >
                  <span className={styles.effectIcon}>{e.kind === "eagle" ? <EagleEyeIcon size={22} /> : e.kind === "pipe" ? <PipeIcon size={22} /> : BONUS_ICON[e.kind]}</span>
                  {e.kind === "boost" || e.kind === "freeze" ? <span className={styles.effectLabel}>{t(`bonuses.${e.kind}`)}</span> : null}
                  <span className={styles.effectBar}>
                    <span style={{ width: `${Math.max(0, Math.min(100, (e.remainingMs / Math.max(1, e.totalMs)) * 100))}%` }} />
                  </span>
                  {e.kind === "freeze" || e.kind === "eagle" ? <span className={styles.effectTime}>{Math.max(1, Math.ceil(e.remainingMs / 1000))}</span> : null}
                </li>
              ))}
            </ul>
          ) : null}

          {!hud.castle ? (
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
            {hud.sprintSupported ? (
              <button
                type="button"
                className={[styles.actionBtn, styles.sprintBtn, hud.sprintActive ? styles.sprintBtnActive : ""].filter(Boolean).join(" ")}
                disabled={!hud.sprintReady && !hud.sprintActive}
                aria-pressed={hud.sprintActive}
                onPointerDown={(e) => {
                  e.preventDefault();
                  sprintPointerRef.current = e.pointerId;
                  sprintHeldRef.current = true;
                }}
                onPointerUp={() => (sprintHeldRef.current = false)}
                onPointerLeave={() => (sprintHeldRef.current = false)}
                onPointerCancel={() => (sprintHeldRef.current = false)}
                onContextMenu={(e) => e.preventDefault()}
              >
                {t("controls.sprint")}
              </button>
            ) : null}
          </div>
          ) : null}
          {phrasesOpen ? <div className={styles.phrasesBackdrop} onPointerDown={() => setPhrasesOpen(false)} aria-hidden /> : null}
          {phrasesOpen ? (
            <div className={styles.phrasesPanel} role="menu" aria-label={t("phrases.title")} style={kbInset > 0 ? { bottom: kbInset + 12 } : undefined}>
              <div className={styles.phrasesGrid}>
                {PHRASES.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    role="menuitem"
                    className={styles.phraseItem}
                    disabled={phraseCooldown}
                    onClick={() => sendPhrase(p.id)}
                  >
                    <span>{p.text[toPhraseLang(locale)]}</span>
                  </button>
                ))}
              </div>
              <form className={styles.customRow} onSubmit={submitCustom}>
                <input
                  ref={customInputRef}
                  className={styles.customInput}
                  value={customText}
                  maxLength={CUSTOM_MAX_LEN}
                  onChange={(e) => setCustomText(e.target.value.slice(0, CUSTOM_MAX_LEN))}
                  onFocus={() => {
                    typingRef.current = true;
                    stickRef.current = null;
                    dirRef.current = { angle: dirRef.current.angle, power: 0 };
                    if (stickBaseRef.current) stickBaseRef.current.style.display = "none";
                  }}
                  onBlur={() => {
                    typingRef.current = false;
                  }}
                  placeholder={t("phrases.customPlaceholder")}
                  aria-label={t("phrases.customLabel")}
                  enterKeyHint="send"
                  autoComplete="off"
                  autoCorrect="off"
                  spellCheck={false}
                />
                <button type="submit" className={styles.customSend} disabled={!customText.trim() || customCooldown} aria-label={t("phrases.customSend")} title={t("phrases.customSend")}>
                  {t("phrases.customSend")}
                </button>
              </form>
              <div className={styles.customCount} aria-live="off">
                {customText.length}/{CUSTOM_MAX_LEN}
                {customCooldown ? ` · ${t("phrases.customWait")}` : ""}
              </div>
              <label className={styles.phrasesToggle}>
                <input type="checkbox" checked={hideOthersPhrases} onChange={(e) => toggleHidePhrases(e.target.checked)} />
                <span>{t("phrases.hideOthers")}</span>
              </label>
            </div>
          ) : null}
          <button
            type="button"
            className={styles.phrasesBtn}
            aria-haspopup="menu"
            aria-expanded={phrasesOpen}
            aria-label={t("phrases.open")}
            title={`${t("phrases.open")} (T)`}
            onClick={(e) => {
              e.currentTarget.blur(); // щоб пробіл ("розділитися") не тиснув цю кнопку
              setPhrasesOpen((v) => !v);
            }}
          >
            <span aria-hidden>💬</span>
          </button>
          <FlockSoundButton variant="hud" onOpen={() => setSoundOpen(true)} />
          {!isTouch && !hud.castle ? <p className={styles.keyHint}>{t("controls.keys")}</p> : null}
        </>
      ) : null}

      {(status === "playing" || status === "dead") && circleEnd ? (
        <div className={styles.cardWrap} onClickCapture={lobbyClickSound}>
          <div className={styles.card} role="alertdialog" aria-label={t("circle.endTitle")}>
            <h2>{t("circle.endTitle")}</h2>
            <p className={styles.sub}>
              {circleEnd.winner ? t("circle.winner", { name: circleEnd.winner.name, mass: circleEnd.winner.mass }) : t("circle.noWinner")}
            </p>
            <p className={circleEnd.you.win ? styles.notice : styles.sub}>
              {circleEnd.you.win
                ? t("circle.youWon")
                : circleEnd.you.place > 0
                  ? t("circle.youPlace", { place: circleEnd.you.place })
                  : t("circle.youOut")}
            </p>
            <dl className={styles.summary}>
              <div>
                <dt>{t("dead.maxSize")}</dt>
                <dd>{circleEnd.you.mass}</dd>
              </div>
            </dl>
            {circleEnd.top.length > 0 ? (
              <ol className={styles.killed}>
                {circleEnd.top.map((row, i) => (
                  <li key={`${row.name}-${i}`}>
                    {i + 1}. {row.name} — {row.mass}
                  </li>
                ))}
              </ol>
            ) : null}
            <p className={styles.sub}>
              {t("circle.next", { s: Math.max(0, Math.ceil((circleEnd.at + circleEnd.restartMs - (nowMs || circleEnd.at)) / 1000)) })}
            </p>
            <div className={styles.cardButtons}>
              <button type="button" className={styles.primary} onClick={() => play()} autoFocus>
                {t("again")}
              </button>
              <button type="button" className={styles.secondary} onClick={handleClose}>
                {t("close")}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {status === "playing" && castleEnd && hud.castle ? (
        <div onClickCapture={lobbyClickSound}>
          <CastleEndCard info={castleEnd} reward={castleReward} onClose={handleClose} onAgain={() => setCastleEnd(null)} />
        </div>
      ) : null}

      {status === "dead" && death && !circleEnd ? (
        <div className={styles.cardWrap} onClickCapture={lobbyClickSound}>
          <div className={styles.card} role="alertdialog" aria-label={t("dead.title")}>
            <h2>{death.burned ? t("dead.burnedTitle") : t("dead.title")}</h2>
            {death.burned ? <p className={styles.sub}>{t("dead.burned")}</p> : null}
            {death.zone ? <p className={styles.sub}>{t("dead.zone")}</p> : null}
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
              <button type="button" className={styles.primary} onClick={() => play()} autoFocus>
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
            if (withPlay) play("normal");
          }}
        />
      ) : null}

      {artifactsOpen && showLobby ? (
        <FlockSheet
          title={t("artifacts.title")}
          closeLabel={t("artifacts.close")}
          onClose={closeArtifacts}
          testId="flock-artifacts"
          headExtra={
            <div className={styles.balance} aria-label={t("rubies.balance", { count: me?.rubies ?? 0 })} title={t("rubies.name")}>
              <RubyIcon size={18} />
              <span>{me?.rubies ?? 0}</span>
            </div>
          }
        >
          {() => (
            <>
    <p className={styles.artifactHint}>{t("artifacts.hint")}</p>
    <div className={styles.artifactPreviewRow}>
      <SkinPreview skinId={skin} artifactId={previewArtifact ?? artifact} size={64} />
      <span>{previewArtifact !== null ? t(`artifacts.items.${previewArtifact}.name`) : artifact > 0 ? t(`artifacts.items.${artifact}.name`) : t("artifacts.none")}</span>
      {artifact > 0 ? (
        <button type="button" className={styles.artifactTakeOff} onClick={() => wearArtifact(0)}>
          {t("artifacts.takeOff")}
        </button>
      ) : null}
    </div>
    <div className={styles.artifacts}>
      {ARTIFACT_IDS.map((id) => {
        const owned = ownedArtifacts.includes(id);
        const worn = artifact === id;
        const name = t(`artifacts.items.${id}.name`);
        return (
          <button
            key={id}
            type="button"
            aria-pressed={worn}
            aria-label={owned ? `${name}${worn ? `: ${t("artifacts.worn")}` : ""}` : `${name}: ${t("rubies.locked")}, ${t("rubies.price", { price: artifactPrice })}`}
            className={`${styles.artifact} ${worn ? styles.artifactWorn : ""} ${owned ? "" : styles.artifactLocked}`}
            onClick={() => openArtifact(id)}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={artifactIconSrc(id) ?? ""} alt="" width={36} height={36} loading="lazy" decoding="async" />
            <strong>{name}</strong>
            <span className={styles.artifactDesc}>{t(`artifacts.items.${id}.desc`, artifactParams)}</span>
            {owned ? (
              worn ? <span className={styles.artifactState}>{t("artifacts.worn")}</span> : null
            ) : (
              <span className={styles.priceTag}>
                <Lock size={11} aria-hidden />
                <RubyIcon size={11} />
                {artifactPrice}
              </span>
            )}
          </button>
        );
      })}
    </div>
    {previewArtifact !== null ? (
      <div className={styles.buyPanel} role="group" aria-label={t("rubies.preview")}>
        <div className={styles.buyInfo}>
          <strong>{t(`artifacts.items.${previewArtifact}.name`)}</strong>
          <span>{t(`artifacts.items.${previewArtifact}.desc`, artifactParams)}</span>
          {artifactConfirming ? (
            <>
              <span>{t("rubies.confirmText", { name: t(`artifacts.items.${previewArtifact}.name`), price: artifactPrice })}</span>
              <div className={styles.buyButtons}>
                <button type="button" className={styles.primary} disabled={artifactBusy} onClick={() => void buyArtifact(previewArtifact)}>
                  {artifactBusy ? t("rubies.buying") : t("rubies.confirm")}
                </button>
                <button type="button" className={styles.secondary} disabled={artifactBusy} onClick={() => setArtifactConfirming(false)}>
                  {t("rubies.cancel")}
                </button>
              </div>
            </>
          ) : (
            <>
              <div className={styles.buyButtons}>
                <button type="button" className={styles.primary} disabled={(me?.rubies ?? 0) < artifactPrice || !me} onClick={() => setArtifactConfirming(true)}>
                  {t("rubies.buy", { price: artifactPrice })} <RubyIcon size={14} />
                </button>
                <button type="button" className={styles.secondary} onClick={() => setPreviewArtifact(null)}>
                  {t("rubies.cancel")}
                </button>
              </div>
              {me && me.rubies < artifactPrice ? <span className={styles.missing}>{t("rubies.missing", { count: artifactPrice - me.rubies })}</span> : null}
            </>
          )}
          {artifactError ? <span className={styles.error}>{t(`rubies.errors.${artifactError}`)}</span> : null}
        </div>
      </div>
    ) : null}
            </>
          )}
        </FlockSheet>
      ) : null}
      {modesOpen && showLobby ? (
        <FlockModes game={me?.config.game} canPlay={status === "ready"} onPlay={() => play("circle")} onPlayCastles={() => setCastlesOpen(true)} onClose={() => setModesOpen(false)} />
      ) : null}
      {castlesOpen && showLobby ? (
        <FlockCastlesLobby
          canPlay={status === "ready"}
          error={notice === "teamUnbalanced" ? t("castles.errUnbalanced") : notice === "teamFull" ? t("castles.errFull") : notice === "skinSide" ? t("castles.errSkin") : notice === "castlesOff" ? t("castles.off") : status === "full" ? t("status.full") : null}
          onJoin={playCastles}
          onClose={() => setCastlesOpen(false)}
        />
      ) : null}
      {soundOpen ? <FlockSoundSettings onClose={() => setSoundOpen(false)} /> : null}
      {infoOpen && showLobby ? <FlockInfo game={me?.config.game} seenBefore={seenBeforeRef.current ?? 0} onUpdatesViewed={onUpdatesViewed} onClose={closeInfo} /> : null}

      {showLobby ? (
        <div className={styles.cardWrap} onClickCapture={lobbyClickSound}>
          <div className={styles.card}>
            <div className={styles.cardHead}>
              <div className={styles.titleRow}>
                <h2>{t("title")}</h2>
                <button type="button" className={styles.infoBtn} onClick={() => setInfoOpen(true)} aria-label={t("info.open")} aria-haspopup="dialog">
                  i
                </button>
                <button type="button" className={`${styles.infoBtn} ${styles.artifactsBtn}`} onClick={() => setArtifactsOpen(true)} aria-label={t("artifacts.open")} title={t("artifacts.title")} aria-haspopup="dialog">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={artifactIconSrc(artifact > 0 ? artifact : ARTIFACT_IDS[0]) ?? ""} alt="" width={18} height={18} decoding="async" />
                  {artifact > 0 ? <span className={styles.wornDot} aria-hidden /> : null}
                </button>
                <FlockSoundButton variant="lobby" onOpen={() => setSoundOpen(true)} />
              </div>
              <div className={styles.balance} aria-label={t("rubies.balance", { count: me?.rubies ?? 0 })} title={t("rubies.name")}>
                <RubyIcon size={18} />
                <span>{me?.rubies ?? 0}</span>
              </div>
            </div>
            <p className={styles.sub}>{t("tagline")}</p>

            <h3 className={styles.h3}>{t("chooseSkin")}</h3>
            {FREE_SKIN_ROWS.map((row, n) => (
              <div key={row[0]} className={styles.skins} style={{ ...rowCols(row), ...(n > 0 ? { marginTop: 6 } : null) }} role="radiogroup" aria-label={t("chooseSkin")}>
                {row.map((i) => skinButton(i))}
              </div>
            ))}
            {paidIds.length > 0 ? (
              <div className={styles.skins} style={{ ...rowCols(paidIds), marginTop: 6 }} role="radiogroup" aria-label={t("chooseSkin")}>
                {paidIds.map((i) => skinButton(i))}
              </div>
            ) : null}
            {specialIds.length > 0 ? (
              <>
                <h3 className={`${styles.h3} ${styles.specialTitle}`}>{t("special")}</h3>
                {splitRows(specialIds).map((row, n) => (
                  <div key={row[0]} className={styles.skins} style={{ ...rowCols(row), ...(n > 0 ? { marginTop: 6 } : null) }} role="radiogroup" aria-label={t("special")}>
                    {row.map((i) => skinButton(i))}
                  </div>
                ))}
              </>
            ) : null}
            {premiumRows.length > 0 ? (
              <>
                <h3 className={`${styles.h3} ${styles.premiumTitle}`}>{t("premium")}</h3>
                {me && !me.premiumCollectionClaimed ? (
                  <p className={styles.collectHint}>
                    <span>{t("premiumCollection.collectHint", { count: me.config.premiumCollectionReward ?? 300 })}</span>
                    <strong>{t("premiumCollection.collectProgress", { n: collectionIds.filter((id) => me.ownedSkins.includes(id)).length, m: collectionIds.length })}</strong>
                  </p>
                ) : null}
                {premiumRows.map((row, n) => (
                  <div key={row[0]} className={styles.skins} style={{ ...rowCols(row), ...(n > 0 ? { marginTop: 6 } : null) }} role="radiogroup" aria-label={t("premium")}>
                    {row.map((i) => skinButton(i))}
                  </div>
                ))}
                {collectionAward?.fromBuy ? (
                  <p className={styles.notice} role="status">
                    {t("premiumCollection.collectDone", { count: collectionAward.amount })}
                  </p>
                ) : null}
              </>
            ) : null}
            {previewSkin === null && isSpecialSkin(skin) && perkList(me?.config.game, skin).length > 0 ? (
              <div className={styles.perkPanel}>
                <strong>{t(`skins.${skin}`)}</strong>
                {perkLines(skin)}
              </div>
            ) : null}
            {previewSkin !== null ? (
              <div className={styles.buyPanel} role="group" aria-label={t("rubies.preview")}>
                <SkinPreview skinId={previewSkin} artifactId={artifact} size={84} />
                <div className={styles.buyInfo}>
                  <strong>{t(`skins.${previewSkin}`)}</strong>
                  {perkLines(previewSkin)}
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

            <FlockDailyBoard initial={me?.daily} />

            {streakAward > 0 ? <p className={styles.notice}>{streakAwardDay > 0 ? t("status.streakAward", { days: streakAwardDay, count: streakAward }) : t("status.streakAwardSum", { count: streakAward })}</p> : null}
            {collectionAward && !collectionAward.fromBuy ? <p className={styles.notice}>{t("premiumCollection.collectDone", { count: collectionAward.amount })}</p> : null}
            {entryBonus > 0 ? <p className={styles.notice}>{t("status.entryBonus", { count: entryBonus })}</p> : null}
            {notice === "teamUnbalanced" || notice === "teamFull" || notice === "skinSide" || notice === "castlesOff" ? <p className={styles.error}>{t(`castles.${notice === "teamUnbalanced" ? "errUnbalanced" : notice === "teamFull" ? "errFull" : notice === "skinSide" ? "errSkin" : "off"}`)}</p> : null}
            {notice === "skinLocked" ? <p className={styles.error}>{t("status.skinLocked")}</p> : null}
            {notice === "artifactLocked" ? <p className={styles.error}>{t("status.artifactLocked")}</p> : null}
            {notice === "roundRunning" ? (
              <p className={styles.notice}>
                {t("status.roundRunning", { s: roundWait ? Math.max(1, Math.ceil((roundWait.ms - ((nowMs || roundWait.at) - roundWait.at)) / 1000)) : 1 })}
              </p>
            ) : null}
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
                <button type="button" className={styles.primary} onClick={() => play("normal")} disabled={status !== "ready"}>
                  {status === "ready" ? t("play") : status === "resuming" ? t("resuming") : t("connecting")}
                </button>
              )}
              <button type="button" className={styles.secondary} onClick={() => setModesOpen(true)} aria-haspopup="dialog">
                {t("modes.open")}
              </button>
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
