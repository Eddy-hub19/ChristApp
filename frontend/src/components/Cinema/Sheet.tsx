"use client";

import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import styles from "./Cinema.module.scss";

type SheetProps = {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  /** Темний «зальний» варіант для діалогів усередині кінозали. */
  tone?: "app" | "hall";
};

/** Нижній лист на телефоні, діалог по центру на планшеті/десктопі. */
export default function Sheet({ open, title, onClose, children, footer, tone = "app" }: SheetProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      {open ? (
        <motion.div
          className={styles.sheetBackdrop}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={title}
            className={`${styles.sheet} ${tone === "hall" ? styles.sheetHall : ""}`}
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 40, opacity: 0 }}
            transition={{ type: "spring", damping: 28, stiffness: 320 }}
            onClick={(e) => e.stopPropagation()}
          >
            <header className={styles.sheetHeader}>
              <h2>{title}</h2>
              <button type="button" className={styles.iconButton} onClick={onClose} aria-label="Close">
                <X size={18} />
              </button>
            </header>
            <div className={styles.sheetBody}>{children}</div>
            {footer ? <footer className={styles.sheetFooter}>{footer}</footer> : null}
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}
