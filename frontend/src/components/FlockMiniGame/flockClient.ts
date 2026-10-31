import createSocket from "socket.io-client";
import { FlockModel, type CircleMsgIn, type FlockCfg } from "./flockModel";
import type { CastleEndInfo, CastleEvent, CastleMsg, CastleRewardInfo, Team } from "./flockCastles";
import { BTN_SPLIT, BTN_SPRINT, BTN_THROW, encodeInputPacked, packetType, PKT_BOARD, PKT_STATE } from "./flockProtocol";
import type { Dir } from "./flockInputMath";
import { playFlockSound } from "./flockSound";
import { attachFlockSounds } from "./flockSoundDirector";
import {
  clearFlockSession,
  isResumable,
  loadFlockSession,
  saveFlockSession,
  type StoredFlockSession,
} from "./flockSession";

export type FlockStatus =
  | "connecting"
  | "ready"
  /** Пробуємо повернутись у збережену сесію (без лобі). */
  | "resuming"
  | "playing"
  /** Звʼязок втрачено, сокет перепідключається, овечка на паузі на сервері. */
  | "reconnecting"
  | "dead"
  | "full"
  | "error"
  | "afk"
  /** Та сама гра відкрилась в іншому вікні й забрала сесію. */
  | "taken";

/** Повідомлення в лобі: "Сесія завершилась, починаємо заново". */
export type FlockNotice = "expired" | "skinLocked" | "artifactLocked" | "roundRunning" | "teamUnbalanced" | "teamFull" | "skinSide" | "castlesOff" | null;

/** Режим арени: звичайна або «Звужуване коло». */
export type FlockMode = "normal" | "circle" | "castles";

/** Підсумок раунду «Звужуване коло» (подія `ce`; you - особисто для цього гравця). */
export interface CircleEndInfo {
  winner: { name: string; mass: number } | null;
  top: { name: string; mass: number }[];
  restartMs: number;
  you: { place: number; win: boolean; mass: number };
}

/** Нагорода від сервера: «Ти перший! +10 рубінів». */
export interface RewardInfo {
  amount: number;
  balance: number;
}

export interface DeathInfo {
  survivedMs: number;
  maxMass: number;
  kills: number;
  killed: string[];
  topMs: number;
  killer: string | null;
  /** Згорів у лаві (карта «Вулкан»). */
  burned?: boolean;
  /** Загинув поза колом (режим «Звужуване коло»). */
  zone?: boolean;
}

export interface FlockClientOptions {
  url: string;
  token: string;
  /** Штучна затримка мережі (мс, в обидва боки) - лише для перевірок на повільному каналі. */
  lagMs?: number;
  /** Арена з посилання-запрошення (лише для нового входу). */
  arenaId?: number | null;
  /** Режим, у якому входимо (за замовчуванням звичайна арена). */
  mode?: FlockMode;
  /** Раунд «Звужуване коло» завершився: показати підсумкову картку. */
  onCircleEnd?: (info: CircleEndInfo) => void;
  /** Стартував новий раунд (картку підсумків ховаємо). */
  onCircleStart?: () => void;
  /** «Замки»: події тіку (для звуків і написів), підсумок матчу й результат нагороди. */
  onCastleEvents?: (events: CastleEvent[], team: Team | 0, pid: number) => void;
  onCastleEnd?: (info: CastleEndInfo) => void;
  onCastleReward?: (info: CastleRewardInfo) => void;
  /** Новий матч «Замків» (фаза не «підсумки»): картку ховаємо. */
  onCastleStart?: () => void;
  /** Мертвого не пускають до кінця раунду: скільки мс чекати. */
  onRoundWait?: (waitMs: number) => void;
  /** Якщо є свіжа збережена сесія - повертатись у неї одразу, без лобі. */
  autoResume?: boolean;
  onStatus: (status: FlockStatus) => void;
  onDeath: (info: DeathInfo) => void;
  onNotice?: (notice: FlockNotice) => void;
  onReward?: (reward: RewardInfo) => void;
  /** Стартувала подія «Зорепад»: показати напис. */
  onZorepad?: () => void;
  /** Спрацювали «Ножиці»: ми підібрали (taker), нас підстригли (victim), count - скільки зачепило. */
  /** «Вожак»: 1 - вышел на охоту, 2 - побеждён (name - кто победил). */
  /** Свій текст відхилено сервером (заборонене слово / мут / вимкнено). */
  onSayRejected?: (reason: "profanity" | "muted" | "disabled") => void;
  onBoss?: (e: { kind: 1 | 2 | 3; name: string }) => void;
  onScissors?: (r: { taker: boolean; victim: boolean; count: number; gain: number }) => void;
  /** «Хрест»: нас з'їли, але «Друге життя» одразу повернуло овечку. */
  onRevive?: () => void;
}

type Sock = ReturnType<typeof createSocket>;

/** Як часто підтверджуємо в сховищі "я на звʼязку" - від цього рахується свіжість токена. */
const HEARTBEAT_MS = 2000;
/** Повідомлення "Сесія завершилась" показуємо лише для свіжих токенів (не через дні). */
const STALE_NOTICE_MS = 10 * 60_000;
/** Версія протоколу: 2+ - кущі приходять один раз у welcome (а не в кожному пакеті стану). */
export const PROTOCOL_VERSION = 2;

/** Тонкий шар над сокетом: підключення, бінарні пакети -> модель, ввід, відновлення сесії. Без React. */
export class FlockClient {
  model: FlockModel | null = null;
  status: FlockStatus = "connecting";
  private socket: Sock | null = null;
  private skin = 0;
  private artifact = 0;
  /** Бонусы выбранного скина для предсказания движения (из /flock/me). */
  private perks: { speed?: number; spawnBoostBonus?: number; spawnBoostMs?: number } = {};
  private mode: FlockMode;
  private team: Team = 1;
  private wantPlay = false;
  private disposed = false;
  private arenaId: number | null;
  private stored: StoredFlockSession | null = null;
  private heartbeat: ReturnType<typeof setInterval> | null = null;
  private readonly lag: number;
  private readonly onVisible = () => {
    if (document.visibilityState === "visible") this.nudge();
  };
  private readonly onOnline = () => this.nudge();
  private readonly onPageHide = () => this.persist(false);

  constructor(private readonly opts: FlockClientOptions) {
    this.lag = Math.max(0, opts.lagMs ?? 0);
    this.arenaId = opts.arenaId ?? null;
    this.mode = opts.mode ?? "normal";
    this.connect();
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", this.onVisible);
      window.addEventListener("online", this.onOnline);
      window.addEventListener("pageshow", this.onOnline);
      window.addEventListener("pagehide", this.onPageHide);
    }
  }

  private setStatus(s: FlockStatus) {
    if (this.disposed) return;
    this.status = s;
    this.opts.onStatus(s);
  }

  private later(fn: () => void) {
    if (this.lag > 0) setTimeout(() => !this.disposed && fn(), this.lag);
    else fn();
  }

  /** Повернулись у застосунок / зʼявилась мережа: якщо сокет не живий - підштовхуємо перепідключення. */
  private nudge() {
    const s = this.socket;
    if (!s || this.disposed) return;
    if (!s.connected && this.status !== "taken" && this.status !== "afk") s.connect();
  }

  private connect() {
    const socket = createSocket(this.opts.url, {
      auth: { token: this.opts.token },
      transports: ["websocket"],
      reconnection: true,
      // Пауза на сервері триває resumePauseMs (зараз 30 с, приходить у welcome як pauseMs); перепідключаємось, поки є сенс, а далі сервер скаже "expired".
      reconnectionAttempts: Infinity,
      reconnectionDelay: 400,
      reconnectionDelayMax: 2000,
    });
    this.socket = socket;
    socket.on("connect", () => {
      const saved = loadFlockSession();
      if (this.wantPlay) {
        // розрив посеред гри: той самий токен, нову овечку не створюємо
        const have = this.stored ?? saved;
        if (have) this.emitResume(have);
        else socket.emit("j", { v: PROTOCOL_VERSION, skin: this.skin, artifact: this.artifact, ...(this.arenaId ? { arena: this.arenaId } : {}), ...this.modeFields() }); // ще не встигли отримати welcome
      } else if (this.opts.autoResume !== false && saved && isResumable(saved)) {
        this.skin = saved.skin;
        this.wantPlay = true;
        this.emitResume(saved);
      } else {
        if (saved && !isResumable(saved)) {
          clearFlockSession();
          // вернулись пізніше за паузу: звичайний вхід, але чесно скажемо, що попередня гра завершилась
          if (Date.now() - saved.savedAt < STALE_NOTICE_MS) this.opts.onNotice?.("expired");
        }
        this.setStatus("ready");
      }
    });
    socket.on("connect_error", () => {
      if (this.status === "playing") this.setStatus("reconnecting");
      else if (this.status !== "reconnecting" && this.status !== "resuming") this.setStatus("error");
    });
    socket.on("disconnect", (reason: string) => {
      if (this.disposed || reason === "io client disconnect") return;
      if (this.status === "afk" || this.status === "taken" || this.status === "full") return;
      if (this.status === "playing" || this.status === "resuming") {
        this.persist(false);
        this.setStatus("reconnecting");
      } else if (this.status !== "dead") {
        this.setStatus("connecting");
      }
    });
    socket.on("w", (cfg: FlockCfg) => {
      this.later(() => {
        this.model = new FlockModel(cfg);
        attachFlockSounds(this.model);
        this.model.selfPerks = this.perks;
        // повтор входу ("Грати знову") лишається в тому ж режимі, у якому ми зараз
        this.mode = cfg.mode === "circle" ? "circle" : cfg.mode === "castles" ? "castles" : "normal";
        if (cfg.castle) this.team = cfg.castle.team;
        this.model.applyStarsSnapshot(cfg.stars, performance.now());
        this.model.applyRain(cfg.rain, performance.now());
        this.model.applyWind(cfg.wind, performance.now());
        this.model.applyCircle(cfg.circle, performance.now());
        this.stored = {
          token: cfg.resumeToken,
          arenaId: cfg.arenaId,
          skin: this.skin,
          savedAt: Date.now(),
          pauseMs: cfg.pauseMs,
          connected: true,
        };
        this.persist(true);
        this.startHeartbeat();
        this.arenaId = null; // запрошена арена діє лише для першого входу
        this.opts.onNotice?.(null);
        this.setStatus("playing");
      });
    });
    socket.on("s", (buf: ArrayBuffer) => {
      this.later(() => {
        if (!this.model || packetType(buf) !== PKT_STATE) return;
        // Виняток у обробнику socket.io-client трактує як "parse error" і РВЕ зʼєднання - тож ловимо самі.
        try {
          this.model.applyState(buf, performance.now());
        } catch (e) {
          console.error("flock: bad state packet", e);
        }
      });
    });
    socket.on("l", (buf: ArrayBuffer) => {
      this.later(() => {
        if (!this.model || packetType(buf) !== PKT_BOARD) return;
        try {
          this.model.applyBoard(buf);
        } catch (e) {
          console.error("flock: bad board packet", e);
        }
      });
    });
    socket.on("d", (info: DeathInfo) => {
      this.later(() => {
        // смерть = сесії більше нема: після неї відновлювати нічого
        this.wantPlay = false;
        this.stopHeartbeat();
        clearFlockSession();
        this.stored = null;
        this.setStatus("dead");
        playFlockSound(info?.burned ? "burn" : "death", { self: true });
        this.opts.onDeath(info);
      });
    });
    socket.on("z", (msg: { e?: unknown }) => {
      this.later(() => {
        if (!this.model) return;
        if (this.model.applyStarEvents(msg?.e, performance.now())) {
          playFlockSound("starWarn", { self: true });
          this.opts.onZorepad?.();
        }
      });
    });
    // «Дощ»: один раз на подію (тривалість, підсихання, калюжі); далі час рахує модель
    socket.on("rn", (msg: { l?: number; d?: number; p?: unknown }) => {
      this.later(() => this.model?.applyRain(msg, performance.now()));
    });
    // «Вітер»: попередження й початок одним повідомленням (напрям, до початку, тривалість)
    socket.on("wd", (msg: { a?: number; w?: number; l?: number }) => {
      this.later(() => this.model?.applyWind(msg, performance.now()));
    });
    socket.on("qt", (msg: unknown) => {
      this.later(() => this.model?.applyText(msg, performance.now()));
    });
    socket.on("qr", (msg: { r?: unknown }) => {
      const r = msg?.r;
      if (r === "profanity" || r === "muted" || r === "disabled") this.opts.onSayRejected?.(r);
    });
    socket.on("lv", (msg: unknown) => {
      this.later(() => this.model?.applyLava(msg, performance.now()));
    });
    socket.on("sc", (msg: unknown) => {
      this.later(() => {
        if (!this.model) return;
        const r = this.model.applyScissors(msg, performance.now());
        if (r && (r.taker || r.victim)) this.opts.onScissors?.(r);
      });
    });
    socket.on("sk", (msg: unknown) => {
      this.later(() => this.model?.applyStreak(msg));
    });
    socket.on("rv", () => {
      this.later(() => {
        if (this.model) {
          playFlockSound("revive", { self: true });
          this.opts.onRevive?.();
        }
      });
    });
    socket.on("q", (msg: unknown) => {
      this.later(() => this.model?.applyPhrase(msg, performance.now()));
    });
    socket.on("bm", (msg: { k?: unknown; n?: unknown }) => {
      // 1 - вышел на охоту, 3 - съел лидера (низкий рог, второй - ниже); 2 - побеждён (светлый звук)
      if (msg?.k === 1) playFlockSound("bossHorn", { self: true });
      else if (msg?.k === 3) playFlockSound("bossHorn", { self: true, pitch: 0.8 });
      else if (msg?.k === 2) playFlockSound("bonus", { self: true });
      if (msg?.k === 1 || msg?.k === 2 || msg?.k === 3) this.opts.onBoss?.({ kind: msg.k, name: typeof msg.n === "string" ? msg.n : "" });
    });
    socket.on("r", (r: RewardInfo) => {
      if (typeof r?.amount === "number" && typeof r?.balance === "number") this.opts.onReward?.(r);
    });
    // «Звужуване коло»: нова стадія кола (клієнти самі рахують радіус за часом) і підсумок раунду
    socket.on("cz", (msg: CircleMsgIn) => {
      this.later(() => {
        if (!this.model) return;
        this.model.applyCircle(msg, performance.now());
        if (msg?.stage === 0) this.opts.onCircleStart?.();
      });
    });
    // «Замки»: стан матчу (~5 Гц), підсумок і нагорода
    socket.on("cm", (msg: CastleMsg) => {
      this.later(() => {
        if (!this.model) return;
        const prevPh = this.model.castle?.ph;
        const ev = this.model.applyCastle(msg, performance.now());
        if (prevPh === 3 && msg.ph !== 3) this.opts.onCastleStart?.();
        if (ev?.length) this.opts.onCastleEvents?.(ev, this.model.myTeam(), this.model.cfg.pid);
      });
    });
    socket.on("te", (info: CastleEndInfo) => {
      this.later(() => this.opts.onCastleEnd?.(info));
    });
    socket.on("tr", (info: CastleRewardInfo) => {
      this.later(() => this.opts.onCastleReward?.(info));
    });
    socket.on("ce", (info: CircleEndInfo) => {
      this.later(() => this.opts.onCircleEnd?.(info));
    });
    socket.on("e", (e: { code?: string; waitMs?: number }) => {
      if (e?.code === "round_running") {
        // «Звужуване коло»: поки раунд іде, мертвий чекає наступного - лобі з підказкою
        this.wantPlay = false;
        this.opts.onNotice?.("roundRunning");
        this.opts.onRoundWait?.(Math.max(0, Number(e.waitMs) || 0));
        this.setStatus("ready");
        return;
      }
      if (e?.code === "team_unbalanced" || e?.code === "team_full" || e?.code === "skin_side" || e?.code === "castles_off") {
        this.wantPlay = false;
        this.opts.onNotice?.(e.code === "team_unbalanced" ? "teamUnbalanced" : e.code === "team_full" ? "teamFull" : e.code === "skin_side" ? "skinSide" : "castlesOff");
        this.setStatus("ready");
        return;
      }
      if (e?.code === "skin_locked") {
        // скін не куплено: сервер на арену не пустив, повертаємось у лобі
        this.wantPlay = false;
        this.opts.onNotice?.("skinLocked");
        this.setStatus("ready");
      } else if (e?.code === "artifact_locked") {
        // артефакт не куплений (или отозван): сервер на арену не пустил, возвращаемся в лобби
        this.wantPlay = false;
        this.opts.onNotice?.("artifactLocked");
        this.setStatus("ready");
      } else if (e?.code === "full") {
        this.wantPlay = false;
        this.setStatus("full");
      } else if (e?.code === "afk") {
        this.wantPlay = false;
        this.stopHeartbeat();
        clearFlockSession();
        this.setStatus("afk");
      } else if (e?.code === "expired") {
        // сесія вже завершилась: лобі з повідомленням, нова гра - за кнопкою
        this.wantPlay = false;
        this.stopHeartbeat();
        clearFlockSession();
        this.stored = null;
        this.opts.onNotice?.("expired");
        this.setStatus("ready");
      } else if (e?.code === "taken") {
        this.wantPlay = false;
        this.stopHeartbeat();
        this.setStatus("taken");
        this.socket?.disconnect();
      } else {
        this.setStatus("error");
      }
    });
  }

  private emitResume(saved: StoredFlockSession | null) {
    if (!saved || !isResumable(saved)) {
      // токен прострочений: сервер його вже не тримає
      clearFlockSession();
      this.stored = null;
      this.wantPlay = false;
      this.opts.onNotice?.(saved ? "expired" : null);
      this.setStatus("ready");
      return;
    }
    this.stored = saved;
    this.setStatus("resuming");
    this.socket?.emit("j", { v: PROTOCOL_VERSION, skin: saved.skin, resume: saved.token, resumeOnly: true });
  }

  private persist(connected: boolean) {
    if (!this.stored) return;
    this.stored = { ...this.stored, savedAt: Date.now(), connected };
    saveFlockSession(this.stored);
  }

  private startHeartbeat() {
    this.stopHeartbeat();
    this.heartbeat = setInterval(() => {
      if (this.socket?.connected && this.status === "playing") this.persist(true);
    }, HEARTBEAT_MS);
  }

  private stopHeartbeat() {
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.heartbeat = null;
  }

  /** Увійти в арену (або відродитись після "Тебе з'їли"). */
  join(skin: number, artifact = 0, mode: FlockMode = this.mode, perks: { speed?: number; spawnBoostBonus?: number; spawnBoostMs?: number } = {}, team?: Team) {
    this.perks = mode === "castles" ? {} : perks;
    if (team) this.team = team;
    if (mode === "castles") artifact = 0;
    this.mode = mode;
    this.skin = skin;
    this.artifact = artifact;
    this.wantPlay = true;
    this.opts.onNotice?.(null);
    if (this.model) this.model.resetCamera();
    if (this.socket?.connected) {
      this.socket.emit("j", { v: PROTOCOL_VERSION, skin, artifact, ...(this.arenaId ? { arena: this.arenaId } : {}), ...this.modeFields() });
    }
  }

  /** Поля режиму для `j`: circle / castles (з командою); звичайна арена - без полів. */
  private modeFields() {
    if (this.mode === "circle") return { mode: "circle" };
    if (this.mode === "castles") return { mode: "castles", team: this.team };
    return {};
  }

  sendInput(dir: Dir, split: boolean, thr: boolean, aspect = 1, sprint = false) {
    const s = this.socket;
    if (!s?.connected || this.status !== "playing") return;
    // одне число = один текстовий кадр socket.io (бінарне вкладення коштує вдвічі більше на сервері)
    const packed = encodeInputPacked(dir.angle, dir.power, (split ? BTN_SPLIT : 0) | (thr ? BTN_THROW : 0) | (sprint ? BTN_SPRINT : 0), aspect);
    const send = () => s.emit("i", packed);
    if (this.lag > 0) setTimeout(send, this.lag);
    else send();
  }

  /** Швидка фраза: по мережі лише id (сервер перевіряє список і ліміт частоти). */
  sendPhrase(id: number) {
    const s = this.socket;
    if (!s?.connected || this.status !== "playing") return;
    s.emit("q", id);
  }

  /** Свій текст у хмаринку (сервер очищає, фільтрує й обмежує частоту); ліміт довжини - 40 символів. */
  sendText(text: string) {
    const s = this.socket;
    if (!s?.connected || this.status !== "playing") return;
    s.emit("q", text.slice(0, 40));
  }

  /** Явний вихід (хрестик): сервер одразу прибирає овечку, без паузи; токен забуваємо. */
  leave() {
    this.wantPlay = false;
    this.stopHeartbeat();
    clearFlockSession();
    this.stored = null;
    try {
      this.socket?.emit("x");
    } catch {
      /* ignore */
    }
    this.dispose();
  }

  /**
   * Закрити клієнт БЕЗ явного виходу (розмонтування, перехід на іншу сторінку): сервер побачить
   * розрив і потримає овечку в паузі; токен лишається для повернення.
   */
  dispose() {
    if (this.disposed) return;
    if (this.status === "playing" || this.status === "reconnecting") this.persist(false);
    this.disposed = true;
    this.stopHeartbeat();
    if (typeof document !== "undefined") {
      document.removeEventListener("visibilitychange", this.onVisible);
      window.removeEventListener("online", this.onOnline);
      window.removeEventListener("pageshow", this.onOnline);
      window.removeEventListener("pagehide", this.onPageHide);
    }
    this.socket?.removeAllListeners();
    this.socket?.disconnect();
    this.socket = null;
  }
}
