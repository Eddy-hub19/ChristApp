/**
 * Вихідні текстові повідомлення, що чекають ехо сервера.
 *
 * Кожне має клієнтський id (`clientMessageId`), який сервер повертає в ехо `newMessage` і за яким ехо замінює
 * саме цю «бульбашку» — навіть якщо прийшло пізніше за таймаут. Без ехо за `SEND_CONFIRM_TIMEOUT_MS` повідомлення
 * не видаляється, а позначається «Не надіслано» з кнопкою «Повторити»; повтор іде з тим самим id, тож сервер
 * (ідемпотентно) не створює дубль, навіть якщо перша відправка таки дійшла.
 */
export const SEND_CONFIRM_TIMEOUT_MS = 12_000;
export const OPTIMISTIC_ID_PREFIX = "tmp-";

export type DeliveryStatus = "sending" | "failed";

export type OutgoingText = {
  clientMessageId: string;
  roomId: string;
  content: string;
  replyToId?: string;
  status: DeliveryStatus;
};

type TimerApi = {
  set: (fn: () => void, ms: number) => unknown;
  clear: (handle: unknown) => void;
};

const defaultTimers: TimerApi = {
  set: (fn, ms) => setTimeout(fn, ms),
  clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

export function createClientMessageId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
}

export const optimisticMessageId = (clientMessageId: string) =>
  `${OPTIMISTIC_ID_PREFIX}${clientMessageId}`;

export const isOptimisticMessageId = (id: string) =>
  id.startsWith(OPTIMISTIC_ID_PREFIX);

export class OutgoingTextQueue {
  private readonly entries = new Map<
    string,
    { entry: OutgoingText; timer: unknown }
  >();

  constructor(
    private readonly onStatus: (
      clientMessageId: string,
      status: DeliveryStatus,
    ) => void,
    private readonly timers: TimerApi = defaultTimers,
    private readonly timeoutMs: number = SEND_CONFIRM_TIMEOUT_MS,
  ) {}

  private arm(clientMessageId: string) {
    const slot = this.entries.get(clientMessageId);
    if (!slot) return;
    this.timers.clear(slot.timer);
    slot.timer = this.timers.set(() => {
      const current = this.entries.get(clientMessageId);
      if (!current) return;
      current.entry = { ...current.entry, status: "failed" };
      this.onStatus(clientMessageId, "failed");
    }, this.timeoutMs);
  }

  add(entry: Omit<OutgoingText, "status">) {
    this.entries.set(entry.clientMessageId, {
      entry: { ...entry, status: "sending" },
      timer: null,
    });
    this.arm(entry.clientMessageId);
  }

  get(clientMessageId: string): OutgoingText | undefined {
    return this.entries.get(clientMessageId)?.entry;
  }

  /** «Повторити»: той самий id, статус знову «надсилається», таймер перезапущено. Повертає запис для повторного emit. */
  retry(clientMessageId: string): OutgoingText | null {
    const slot = this.entries.get(clientMessageId);
    if (!slot) return null;
    slot.entry = { ...slot.entry, status: "sending" };
    this.arm(clientMessageId);
    this.onStatus(clientMessageId, "sending");
    return slot.entry;
  }

  /**
   * Ехо отримано. За clientMessageId; для ехо без нього (старий сервер) — найстаріший запис із тим самим текстом.
   * Повертає знятий із черги запис або null (ехо вже обробляли або це чуже повідомлення).
   */
  confirm(clientMessageId: string | undefined, content?: string): OutgoingText | null {
    let key = clientMessageId && this.entries.has(clientMessageId) ? clientMessageId : undefined;
    if (!key && !clientMessageId && content !== undefined) {
      for (const [id, slot] of this.entries) {
        if (slot.entry.content === content) {
          key = id;
          break;
        }
      }
    }
    if (!key) return null;
    const slot = this.entries.get(key)!;
    this.timers.clear(slot.timer);
    this.entries.delete(key);
    return slot.entry;
  }

  clear() {
    this.entries.forEach((slot) => this.timers.clear(slot.timer));
    this.entries.clear();
  }

  get size() {
    return this.entries.size;
  }
}

type WithDelivery = {
  id: string;
  clientMessageId?: string;
  deliveryStatus?: DeliveryStatus;
};

export function setDeliveryStatus<T extends WithDelivery>(
  messages: T[],
  clientMessageId: string,
  status: DeliveryStatus,
): T[] {
  let changed = false;
  const next = messages.map((message) => {
    if (message.clientMessageId !== clientMessageId || message.deliveryStatus === status) {
      return message;
    }
    changed = true;
    return { ...message, deliveryStatus: status };
  });
  return changed ? next : messages;
}

/**
 * Вносить ехо сервера в список: тимчасова «бульбашка» з тим самим clientMessageId (або вже знята з черги
 * `replacedClientMessageId`) замінюється справжнім повідомленням; повторне ехо (дубль від ідемпотентного
 * повтору) не додає другу копію.
 */
export function integrateEcho<T extends WithDelivery>(
  messages: T[],
  echo: T,
  replacedClientMessageId?: string,
): T[] {
  const cid = echo.clientMessageId ?? replacedClientMessageId;
  const withoutLocal = cid
    ? messages.filter(
        (message) =>
          !(isOptimisticMessageId(message.id) && message.clientMessageId === cid),
      )
    : messages;
  if (withoutLocal.some((message) => message.id === echo.id)) {
    return withoutLocal.length === messages.length ? messages : withoutLocal;
  }
  return [...withoutLocal, { ...echo, deliveryStatus: undefined }];
}
