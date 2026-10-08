import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  OutgoingTextQueue,
  SEND_CONFIRM_TIMEOUT_MS,
  integrateEcho,
  optimisticMessageId,
  setDeliveryStatus,
  type DeliveryStatus,
} from "./chatOutgoing";

type M = {
  id: string;
  content: string;
  clientMessageId?: string;
  deliveryStatus?: DeliveryStatus;
};

const CID = "cid-1";
const tmp = (): M => ({
  id: optimisticMessageId(CID),
  content: "Привіт",
  clientMessageId: CID,
  deliveryStatus: "sending",
});
const echo = (): M => ({ id: "srv-1", content: "Привіт", clientMessageId: CID });

/** Мінімальна модель сторінки: список + черга, як у page.tsx. */
function setup() {
  let list: M[] = [];
  const queue = new OutgoingTextQueue((cid, status) => {
    list = setDeliveryStatus(list, cid, status);
  });
  const send = () => {
    list = [...list, tmp()];
    queue.add({ clientMessageId: CID, roomId: "r1", content: "Привіт" });
  };
  const onEcho = (message: M) => {
    const confirmed = queue.confirm(message.clientMessageId, message.content);
    list = integrateEcho(list, message, confirmed?.clientMessageId);
  };
  return { send, onEcho, queue, get list() { return list; } };
}

describe("OutgoingTextQueue + integrateEcho", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("без ехо за 12 с повідомлення не видаляється, а стає «failed»", () => {
    const s = setup();
    s.send();
    vi.advanceTimersByTime(SEND_CONFIRM_TIMEOUT_MS - 1);
    expect(s.list[0].deliveryStatus).toBe("sending");
    vi.advanceTimersByTime(1);
    expect(s.list).toHaveLength(1);
    expect(s.list[0].deliveryStatus).toBe("failed");
  });

  it("ехо через 20 с (після «Не надіслано») замінює саме цю бульбашку", () => {
    const s = setup();
    s.send();
    vi.advanceTimersByTime(20_000);
    expect(s.list[0].deliveryStatus).toBe("failed");
    s.onEcho(echo());
    expect(s.list).toEqual([{ ...echo(), deliveryStatus: undefined }]);
    expect(s.queue.size).toBe(0);
  });

  it("повтор після таймауту: той самий id, статус «sending», таймер перезапущено", () => {
    const s = setup();
    s.send();
    vi.advanceTimersByTime(SEND_CONFIRM_TIMEOUT_MS);
    const retried = s.queue.retry(CID);
    expect(retried).toMatchObject({ clientMessageId: CID, content: "Привіт", status: "sending" });
    expect(s.list[0].deliveryStatus).toBe("sending");
    vi.advanceTimersByTime(SEND_CONFIRM_TIMEOUT_MS);
    expect(s.list[0].deliveryStatus).toBe("failed");
    s.queue.retry(CID);
    s.onEcho(echo());
    expect(s.list.map((m) => m.id)).toEqual(["srv-1"]);
  });

  it("повтор, коли перша відправка таки дійшла: два ехо дають одну копію", () => {
    const s = setup();
    s.send();
    vi.advanceTimersByTime(SEND_CONFIRM_TIMEOUT_MS);
    s.queue.retry(CID);
    s.onEcho(echo()); // оригінальне запізніле ехо
    s.onEcho(echo()); // ехо від ідемпотентного повтору (сервер не створив дубль, id той самий)
    expect(s.list.map((m) => m.id)).toEqual(["srv-1"]);
    expect(s.list).toHaveLength(1);
  });

  it("ехо без clientMessageId (старий сервер) зв'язується за текстом", () => {
    const s = setup();
    s.send();
    s.onEcho({ id: "srv-2", content: "Привіт" });
    expect(s.list.map((m) => m.id)).toEqual(["srv-2"]);
  });

  it("чуже повідомлення не чіпає чергу й додається як є", () => {
    const s = setup();
    s.send();
    s.onEcho({ id: "peer-1", content: "Інше", clientMessageId: "other" });
    expect(s.list.map((m) => m.id)).toEqual([optimisticMessageId(CID), "peer-1"]);
    expect(s.queue.size).toBe(1);
  });
});
