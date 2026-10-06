/** Види подій, що відправляють пуш; по них ведеться лог і лічильники. */
export type PushKind =
  | 'chat'
  | 'watch'
  | 'watchInvite'
  | 'call'
  | 'readSync'
  | 'test';

export type PushSendResult = {
  ok: boolean;
  /** HTTP-код push-сервісу, якщо дійшов до нього. */
  status?: number;
  /** Підписку видалено (404/410). */
  removed?: boolean;
  error?: string;
};

type KindStats = {
  sent: number;
  failed: number;
  removed: number;
  retried: number;
  /** HTTP-код (або "network") → кількість помилок. */
  errors: Record<string, number>;
};

const emptyStats = (): KindStats => ({ sent: 0, failed: 0, removed: 0, retried: 0, errors: {} });

/** Лічильники відправки по типах подій (у памʼяті процесу; скидаються при перезапуску). */
export class PushDeliveryStats {
  private readonly byKind = new Map<PushKind, KindStats>();

  private stats(kind: PushKind) {
    let s = this.byKind.get(kind);
    if (!s) {
      s = emptyStats();
      this.byKind.set(kind, s);
    }
    return s;
  }

  record(kind: PushKind, result: PushSendResult, retried = false) {
    const s = this.stats(kind);
    if (retried) s.retried += 1;
    if (result.ok) {
      s.sent += 1;
      return;
    }
    s.failed += 1;
    if (result.removed) s.removed += 1;
    const code = result.status !== undefined ? String(result.status) : 'network';
    s.errors[code] = (s.errors[code] ?? 0) + 1;
  }

  snapshot(): Record<string, KindStats> {
    return Object.fromEntries(
      [...this.byKind.entries()].map(([kind, s]) => [kind, { ...s, errors: { ...s.errors } }]),
    );
  }
}

export const PUSH_TTL_SECONDS = 24 * 60 * 60;
export const PUSH_RETRY_DELAY_MS = 400;

/** Тимчасові збої push-сервісу, які варто повторити один раз: 429, 5xx і мережеві помилки без коду. */
export function isRetryablePushStatus(status: number | undefined) {
  return status === undefined || status === 429 || status >= 500;
}

/**
 * Зведений рядок одного розсилання: скільки пристроїв, скільки доставлено, скільки помилок і яких.
 * Приклад: `push[chat] room=… recipients=2 devices=3 sent=2 failed=1 removed=1 errors={"410":1}`.
 */
export function summarizeDispatch(
  kind: PushKind,
  context: string,
  recipients: number,
  results: PushSendResult[],
) {
  const errors: Record<string, number> = {};
  let sent = 0;
  let removed = 0;
  for (const r of results) {
    if (r.ok) sent += 1;
    else {
      if (r.removed) removed += 1;
      const code = r.status !== undefined ? String(r.status) : 'network';
      errors[code] = (errors[code] ?? 0) + 1;
    }
  }
  return `push[${kind}] ${context} recipients=${recipients} devices=${results.length} sent=${sent} failed=${results.length - sent} removed=${removed} errors=${JSON.stringify(errors)}`;
}
