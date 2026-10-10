import createSocket from "socket.io-client";
import { FlockModel, type FlockCfg } from "./flockModel";
import { BTN_SPLIT, BTN_THROW, encodeInput, packetType, PKT_BOARD, PKT_STATE } from "./flockProtocol";
import type { Dir } from "./flockInputMath";
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
export type FlockNotice = "expired" | null;

export interface DeathInfo {
  survivedMs: number;
  maxMass: number;
  kills: number;
  killed: string[];
  topMs: number;
  killer: string | null;
}

export interface FlockClientOptions {
  url: string;
  token: string;
  /** Штучна затримка мережі (мс, в обидва боки) - лише для перевірок на повільному каналі. */
  lagMs?: number;
  /** Арена з посилання-запрошення (лише для нового входу). */
  arenaId?: number | null;
  /** Якщо є свіжа збережена сесія - повертатись у неї одразу, без лобі. */
  autoResume?: boolean;
  onStatus: (status: FlockStatus) => void;
  onDeath: (info: DeathInfo) => void;
  onNotice?: (notice: FlockNotice) => void;
}

type Sock = ReturnType<typeof createSocket>;

/** Як часто підтверджуємо в сховищі "я на звʼязку" - від цього рахується свіжість токена. */
const HEARTBEAT_MS = 2000;
/** Повідомлення "Сесія завершилась" показуємо лише для свіжих токенів (не через дні). */
const STALE_NOTICE_MS = 10 * 60_000;

/** Тонкий шар над сокетом: підключення, бінарні пакети -> модель, ввід, відновлення сесії. Без React. */
export class FlockClient {
  model: FlockModel | null = null;
  status: FlockStatus = "connecting";
  private socket: Sock | null = null;
  private skin = 0;
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
      // Пауза на сервері триває ~20 с; перепідключаємось, поки є сенс, а далі сервер скаже "expired".
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
        else socket.emit("j", { skin: this.skin, ...(this.arenaId ? { arena: this.arenaId } : {}) }); // ще не встигли отримати welcome
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
        this.model.applyState(buf);
      });
    });
    socket.on("l", (buf: ArrayBuffer) => {
      this.later(() => {
        if (!this.model || packetType(buf) !== PKT_BOARD) return;
        this.model.applyBoard(buf);
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
        this.opts.onDeath(info);
      });
    });
    socket.on("e", (e: { code?: string }) => {
      if (e?.code === "full") {
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
    this.socket?.emit("j", { skin: saved.skin, resume: saved.token, resumeOnly: true });
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
  join(skin: number) {
    this.skin = skin;
    this.wantPlay = true;
    this.opts.onNotice?.(null);
    if (this.model) this.model.resetCamera();
    if (this.socket?.connected) {
      this.socket.emit("j", { skin, ...(this.arenaId ? { arena: this.arenaId } : {}) });
    }
  }

  sendInput(dir: Dir, split: boolean, thr: boolean, aspect = 1) {
    const s = this.socket;
    if (!s?.connected || this.status !== "playing") return;
    const buf = encodeInput(dir.angle, dir.power, (split ? BTN_SPLIT : 0) | (thr ? BTN_THROW : 0), aspect);
    const send = () => s.emit("i", buf);
    if (this.lag > 0) setTimeout(send, this.lag);
    else send();
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
