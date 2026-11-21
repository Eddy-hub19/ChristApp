/**
 * Какие сокеты сейчас слушает провайдер звонков. Сокет пользователя бывает двух видов: «присутствие» (все страницы, кроме
 * личного чата) и сокет страницы чата. Оба вызывают `registerCallSocket`, провайдер подписывается на все зарегистрированные.
 * Модульный реестр, а не контекст: порядок монтирования страницы и провайдера не важен.
 */
import type createSocket from "socket.io-client";

export type Socket = ReturnType<typeof createSocket>;

type Listener = (sockets: ReadonlySet<Socket>) => void;

const sockets = new Set<Socket>();
const listeners = new Set<Listener>();

function notify() {
  for (const listener of listeners) listener(sockets);
}

/** Регистрирует сокет; возвращает функцию отмены регистрации (вызвать при отключении сокета). */
export function registerCallSocket(socket: Socket): () => void {
  sockets.add(socket);
  notify();
  return () => {
    if (sockets.delete(socket)) notify();
  };
}

export function subscribeCallSockets(listener: Listener): () => void {
  listeners.add(listener);
  listener(sockets);
  return () => {
    listeners.delete(listener);
  };
}

/** Подключённый сокет для отправки: последний зарегистрированный из подключённых. */
export function pickCallSocket(): Socket | null {
  let picked: Socket | null = null;
  for (const s of sockets) if (s.connected) picked = s;
  return picked;
}
