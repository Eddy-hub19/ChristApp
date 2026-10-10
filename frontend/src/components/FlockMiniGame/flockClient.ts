import createSocket from "socket.io-client";
import { FlockModel, type FlockCfg } from "./flockModel";
import { BTN_SPLIT, BTN_THROW, encodeInput, packetType, PKT_BOARD, PKT_STATE } from "./flockProtocol";
import type { Dir } from "./flockInputMath";

export type FlockStatus = "connecting" | "ready" | "playing" | "dead" | "full" | "error" | "afk";

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
  onStatus: (status: FlockStatus) => void;
  onDeath: (info: DeathInfo) => void;
}

type Sock = ReturnType<typeof createSocket>;

/** Тонкий шар над сокетом: підключення, бінарні пакети -> модель, ввід. Без React. */
export class FlockClient {
  model: FlockModel | null = null;
  status: FlockStatus = "connecting";
  private socket: Sock | null = null;
  private skin = 0;
  private wantPlay = false;
  private disposed = false;
  private readonly lag: number;

  constructor(private readonly opts: FlockClientOptions) {
    this.lag = Math.max(0, opts.lagMs ?? 0);
    this.connect();
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

  private connect() {
    const socket = createSocket(this.opts.url, {
      auth: { token: this.opts.token },
      transports: ["websocket"],
      reconnection: true,
      reconnectionAttempts: 6,
      reconnectionDelay: 500,
      reconnectionDelayMax: 3000,
    });
    this.socket = socket;
    socket.on("connect", () => {
      if (this.wantPlay) this.emitJoin();
      else this.setStatus("ready");
    });
    socket.on("connect_error", () => this.setStatus("error"));
    socket.on("disconnect", () => {
      if (!this.disposed && this.status !== "afk") this.setStatus("connecting");
    });
    socket.on("w", (cfg: FlockCfg) => {
      this.later(() => {
        this.model = new FlockModel(cfg);
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
        this.setStatus("dead");
        this.opts.onDeath(info);
      });
    });
    socket.on("e", (e: { code?: string }) => {
      if (e?.code === "full") this.setStatus("full");
      else if (e?.code === "afk") this.setStatus("afk");
      else this.setStatus("error");
    });
  }

  private emitJoin() {
    this.socket?.emit("j", { skin: this.skin });
  }

  /** Увійти в арену (або відродитись після "Тебе з'їли"). */
  join(skin: number) {
    this.skin = skin;
    this.wantPlay = true;
    if (this.model) this.model.resetCamera();
    if (this.socket?.connected) this.emitJoin();
  }

  sendInput(dir: Dir, split: boolean, thr: boolean, aspect = 1) {
    const s = this.socket;
    if (!s?.connected || this.status !== "playing") return;
    const buf = encodeInput(dir.angle, dir.power, (split ? BTN_SPLIT : 0) | (thr ? BTN_THROW : 0), aspect);
    const send = () => s.emit("i", buf);
    if (this.lag > 0) setTimeout(send, this.lag);
    else send();
  }

  dispose() {
    this.disposed = true;
    try {
      this.socket?.emit("x");
    } catch {
      /* ignore */
    }
    this.socket?.removeAllListeners();
    this.socket?.disconnect();
    this.socket = null;
  }
}
