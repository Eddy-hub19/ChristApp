import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { attachPresenceReporter, PRESENCE_HEARTBEAT_MS } from "./presenceReporter";

vi.mock("@/lib/viewStateBeacon", () => ({ clearServerViewState: vi.fn() }));

function setup(initiallyVisible = true) {
  const doc = Object.assign(new EventTarget(), { visibilityState: initiallyVisible ? "visible" : "hidden" });
  const win = new EventTarget();
  const handlers = new Map<string, () => void>();
  const socket = {
    id: "sock-1",
    connected: true,
    emitted: [] as Array<{ active: boolean }>,
    emit(event: string, payload: { active: boolean }) {
      if (event === "presence:state") this.emitted.push(payload);
    },
    on(event: string, fn: () => void) {
      handlers.set(event, fn);
    },
    off(event: string) {
      handlers.delete(event);
    },
  };
  const beaconAway = vi.fn();
  const detach = attachPresenceReporter(socket as never, {
    doc: doc as never,
    win: win as never,
    beaconAway,
  });
  const states = () => socket.emitted.map((e) => e.active);
  const hide = () => {
    doc.visibilityState = "hidden";
    doc.dispatchEvent(new Event("visibilitychange"));
  };
  const show = () => {
    doc.visibilityState = "visible";
    doc.dispatchEvent(new Event("visibilitychange"));
  };
  return { doc, win, socket, handlers, beaconAway, detach, states, hide, show };
}

describe("attachPresenceReporter", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("reports active on open and heartbeats every ~20s while visible", () => {
    const { states } = setup();
    expect(states()).toEqual([true]);
    vi.advanceTimersByTime(PRESENCE_HEARTBEAT_MS * 3);
    expect(states()).toEqual([true, true, true, true]);
  });

  it("hidden: away immediately (socket + keepalive beacon) and heartbeats stop", () => {
    const { states, hide, beaconAway } = setup();
    hide();
    expect(states()).toEqual([true, false]);
    expect(beaconAway).toHaveBeenCalledWith("sock-1");
    vi.advanceTimersByTime(PRESENCE_HEARTBEAT_MS * 5);
    expect(states()).toEqual([true, false]);
  });

  it("returning to the app reports active again and resumes heartbeats", () => {
    const { states, hide, show } = setup();
    hide();
    show();
    expect(states()).toEqual([true, false, true]);
    vi.advanceTimersByTime(PRESENCE_HEARTBEAT_MS);
    expect(states()).toEqual([true, false, true, true]);
  });

  it("pagehide and freeze go away even while visibilityState still says visible", () => {
    const a = setup();
    a.win.dispatchEvent(new Event("pagehide"));
    expect(a.states()).toEqual([true, false]);
    expect(a.beaconAway).toHaveBeenCalledTimes(1);

    const b = setup();
    b.doc.dispatchEvent(new Event("freeze"));
    expect(b.states()).toEqual([true, false]);
    b.doc.dispatchEvent(new Event("resume"));
    expect(b.states()).toEqual([true, false, true]);
  });

  it("a socket (re)connecting while the app is hidden does not mark the user online", () => {
    const { states, handlers, socket } = setup(false);
    expect(states()).toEqual([false]);
    socket.connected = true;
    handlers.get("connect")?.();
    expect(states().every((s) => s === false)).toBe(true);
  });

  it("a reconnect while visible reports active", () => {
    const { states, handlers } = setup();
    handlers.get("connect")?.();
    expect(states()).toEqual([true, true]);
  });

  it("nothing is sent over a closed socket", () => {
    const { socket, states, hide } = setup();
    socket.connected = false;
    hide();
    expect(states()).toEqual([true]);
  });

  it("detach stops heartbeats and listeners without flashing away", () => {
    const { states, detach, hide } = setup();
    detach();
    vi.advanceTimersByTime(PRESENCE_HEARTBEAT_MS * 3);
    hide();
    expect(states()).toEqual([true]);
  });
});
