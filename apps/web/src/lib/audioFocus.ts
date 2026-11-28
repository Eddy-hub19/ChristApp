/**
 * Аудіофокус застосунку: у кожен момент звучить лише одне джерело. Плеєр треків і менеджер голосових
 * (voicePlayback.ts) мають окремі <audio> (у голосових свій ланцюжок автопереходу), тож перед стартом
 * кожне джерело просить фокус, а решта ставить себе на паузу.
 */
export type AudioOwner = "player" | "voice";

type Listener = (owner: AudioOwner) => void;

const listeners = new Set<Listener>();

/** Підписка на запит фокусу; повертає відписку. */
export function subscribeAudioFocus(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Джерело збирається грати: усі інші мають замовкнути. */
export function requestAudioFocus(owner: AudioOwner) {
  listeners.forEach((listener) => listener(owner));
}
