"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { HallReaction } from "./useWatchHall";
import styles from "./CinemaHall.module.scss";

type Floating = HallReaction & { x: number; drift: number };

const MAX_ON_SCREEN = 24;

/**
 * Реакції спливають над екраном — у смузі завіси, а не поверх самого відео,
 * щоб не перекривати плеєр, рекламу й елементи YouTube.
 */
export default function FloatingReactions({
  subscribe,
}: {
  subscribe: (listener: (r: HallReaction) => void) => () => void;
}) {
  const [items, setItems] = useState<Floating[]>([]);

  useEffect(
    () =>
      subscribe((reaction) => {
        const item: Floating = {
          ...reaction,
          x: 8 + Math.random() * 84,
          drift: (Math.random() - 0.5) * 40,
        };
        setItems((prev) => [...prev.slice(-(MAX_ON_SCREEN - 1)), item]);
        window.setTimeout(() => {
          setItems((prev) => prev.filter((p) => p.id !== item.id));
        }, 2600);
      }),
    [subscribe],
  );

  return (
    <div className={styles.reactionsLayer} aria-hidden>
      <AnimatePresence>
        {items.map((item) => (
          <motion.span
            key={item.id}
            className={styles.floatingEmoji}
            style={{ left: `${item.x}%` }}
            initial={{ opacity: 0, y: 0, scale: 0.6 }}
            animate={{ opacity: [0, 1, 1, 0], y: -110, x: item.drift, scale: [0.6, 1.25, 1, 0.9] }}
            exit={{ opacity: 0 }}
            transition={{ duration: 2.4, ease: "easeOut" }}
          >
            {item.emoji}
          </motion.span>
        ))}
      </AnimatePresence>
    </div>
  );
}
