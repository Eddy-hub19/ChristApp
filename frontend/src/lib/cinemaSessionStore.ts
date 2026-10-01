/**
 * Крихітний зовнішній стор: чи є зараз активна сесія «Кіношки» (зала або мініплеєр).
 * PresenceSocket стоїть ВИЩЕ за CinemaProvider у дереві, тому не може читати його контекст —
 * провайдер пише сюди, сокет підписується.
 */
let active = false;
const listeners = new Set<() => void>();

export function setCinemaSessionActive(next: boolean) {
  if (active === next) return;
  active = next;
  listeners.forEach((listener) => listener());
}

export function getCinemaSessionActive(): boolean {
  return active;
}

export function subscribeCinemaSession(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
