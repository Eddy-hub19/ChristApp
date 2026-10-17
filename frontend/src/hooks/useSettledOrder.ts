"use client";

import { useEffect, useRef, useState } from "react";

const SETTLE_DELAY_MS = 600;
/** Скільки після останнього скролу/дотику список вважається «в руках» користувача. */
const SCROLL_IDLE_MS = 700;
const RETRY_MS = 200;

type Slot = { id: string; group: string };

function sameMembers(a: readonly Slot[], b: readonly Slot[]) {
  if (a.length !== b.length) return false;
  const set = new Set(a.map((slot) => slot.id));
  return b.every((slot) => set.has(slot.id));
}

const keyOf = (slots: readonly Slot[]) => slots.map((slot) => `${slot.group}\u0001${slot.id}`).join("\u0000");

/**
 * Дані елементів завжди свіжі, а ПОРЯДОК, що змінився (хтось зайшов/вийшов), застосовується з невеликою
 * затримкою і лише коли користувач не скролить (scroll/touch ловимо на документі: скролиться зазвичай предок списку) — список не «стрибає» під пальцем.
 * Склад списку (додали/прибрали людину, пошук) застосовується одразу. `getGroup` (розділ) зберігається
 * разом із порядком, щоб заголовки не роз'їжджалися з позиціями; повертається `group` для кожного елемента.
 */
export function useSettledOrder<T>(
  items: readonly T[],
  getId: (item: T) => string,
  getGroup: (item: T) => string,
): Array<{ item: T; group: string }> {
  const target: Slot[] = items.map((item) => ({ id: getId(item), group: getGroup(item) }));
  const targetKey = keyOf(target);
  const [settled, setSettled] = useState<Slot[]>(target);
  const busyRef = useRef({ touching: false, lastAt: 0 });

  if (!sameMembers(settled, target)) {
    setSettled(target);
  }

  useEffect(() => {
    const root = document;
    const busy = busyRef.current;
    const mark = () => {
      busy.lastAt = Date.now();
    };
    const onStart = () => {
      busy.touching = true;
      mark();
    };
    const onEnd = () => {
      busy.touching = false;
      mark();
    };
    const opts = { capture: true, passive: true } as const;
    root.addEventListener("scroll", mark, opts);
    root.addEventListener("wheel", mark, opts);
    root.addEventListener("touchmove", mark, opts);
    root.addEventListener("touchstart", onStart, opts);
    root.addEventListener("touchend", onEnd, opts);
    root.addEventListener("touchcancel", onEnd, opts);
    return () => {
      root.removeEventListener("scroll", mark, opts);
      root.removeEventListener("wheel", mark, opts);
      root.removeEventListener("touchmove", mark, opts);
      root.removeEventListener("touchstart", onStart, opts);
      root.removeEventListener("touchend", onEnd, opts);
      root.removeEventListener("touchcancel", onEnd, opts);
    };
  }, []);

  const settledKey = keyOf(settled);
  const targetRef = useRef(target);
  useEffect(() => {
    targetRef.current = target;
  });
  useEffect(() => {
    if (settledKey === targetKey) return;
    let timer: number;
    const attempt = () => {
      const busy = busyRef.current;
      if (busy.touching || Date.now() - busy.lastAt < SCROLL_IDLE_MS) {
        timer = window.setTimeout(attempt, RETRY_MS);
        return;
      }
      setSettled(targetRef.current);
    };
    timer = window.setTimeout(attempt, SETTLE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [settledKey, targetKey]);

  const byId = new Map(items.map((item) => [getId(item), item]));
  const ordered: Array<{ item: T; group: string }> = [];
  for (const slot of settled) {
    const item = byId.get(slot.id);
    if (item) ordered.push({ item, group: slot.group });
  }
  return ordered;
}
