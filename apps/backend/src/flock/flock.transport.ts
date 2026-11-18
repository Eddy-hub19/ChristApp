import type { Socket } from 'socket.io';

/**
 * Відправник пакетів арени через socket.io: стан - volatile (застарілий кадр на повільному каналі
 * не ставимо в чергу), решта (таблиця лідерів, смерть, welcome) - надійно.
 *
 * Пробували "cork" (склеїти кадри тіка в один writev) - виграш ~2%, а лізе у нутрощі engine.io, тому прибрано.
 */
export function createSender(
  getSocket: (connKey: string) => Socket | undefined,
) {
  return (
    connKey: string,
    event: string,
    payload: Uint8Array | object,
  ): void => {
    const sock = getSocket(connKey);
    if (!sock) return;
    if (payload instanceof Uint8Array) {
      const data = Buffer.from(
        payload.buffer,
        payload.byteOffset,
        payload.byteLength,
      );
      if (event === 's') sock.volatile.emit(event, data);
      else sock.emit(event, data);
    } else {
      sock.emit(event, payload);
    }
  };
}
