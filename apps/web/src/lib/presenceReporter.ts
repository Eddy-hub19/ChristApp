import { clearServerViewState } from "@/lib/viewStateBeacon";

/** Як часто повідомляємо серверу «застосунок досі видно». Сервер знімає онлайн після ~45 с тиші. */
export const PRESENCE_HEARTBEAT_MS = 20_000;

type ReporterSocket = {
  id?: string;
  connected: boolean;
  emit: (event: string, ...args: unknown[]) => unknown;
  on: (event: string, listener: () => void) => unknown;
  off: (event: string, listener: () => void) => unknown;
};

type ReporterEnv = {
  doc: Pick<Document, "addEventListener" | "removeEventListener"> & { visibilityState: string };
  win: Pick<Window, "addEventListener" | "removeEventListener">;
  /** Негайне «away» через fetch keepalive (той самий запит, що знімає «перегляди» кімнат). */
  beaconAway: (socketId: string | undefined) => void;
};

/**
 * «Онлайн» = застосунок відкритий і видимий (як у Telegram), а не «сокет підключений».
 * Сокет каже серверу `presence:state`: active — при відкритті/поверненні й heartbeat кожні ~20 с, поки видно;
 * away — одразу при visibilitychange→hidden, pagehide, freeze (і дублюється fetch keepalive, бо iOS заморожує
 * сторінку раніше, ніж встигає піти кадр сокета). Мініплеєр кінотеатру/PiP виду застосунку не додають:
 * згорнули застосунок — офлайн, навіть якщо відео ще грає у віконці системи.
 *
 * Повертає функцію відписки. При відписці `away` НЕ шлемо: сокет міняється при навігації, а розрив
 * сервер і так згладжує дебаунсом (5 с) — інакше статус блимав би на кожному переході.
 */
export function attachPresenceReporter(
  socket: ReporterSocket,
  env: ReporterEnv = {
    doc: document,
    win: window,
    beaconAway: clearServerViewState,
  },
): () => void {
  let heartbeat: ReturnType<typeof setInterval> | null = null;

  const stopHeartbeat = () => {
    if (heartbeat) clearInterval(heartbeat);
    heartbeat = null;
  };

  const send = (active: boolean) => {
    if (socket.connected) socket.emit("presence:state", { active });
  };

  const goAway = () => {
    stopHeartbeat();
    send(false);
    env.beaconAway(socket.id);
  };

  const sync = () => {
    if (env.doc.visibilityState !== "visible") {
      goAway();
      return;
    }
    send(true);
    if (!heartbeat) heartbeat = setInterval(() => send(true), PRESENCE_HEARTBEAT_MS);
  };

  const onConnect = () => sync();
  const onPageHide = () => goAway();

  sync();
  socket.on("connect", onConnect);
  env.doc.addEventListener("visibilitychange", sync);
  env.doc.addEventListener("freeze", onPageHide);
  env.doc.addEventListener("resume", sync);
  env.win.addEventListener("pagehide", onPageHide);
  env.win.addEventListener("pageshow", sync);
  env.win.addEventListener("focus", sync);

  return () => {
    stopHeartbeat();
    socket.off("connect", onConnect);
    env.doc.removeEventListener("visibilitychange", sync);
    env.doc.removeEventListener("freeze", onPageHide);
    env.doc.removeEventListener("resume", sync);
    env.win.removeEventListener("pagehide", onPageHide);
    env.win.removeEventListener("pageshow", sync);
    env.win.removeEventListener("focus", sync);
  };
}
