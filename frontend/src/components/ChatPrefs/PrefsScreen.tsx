"use client";

import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import base from "@/components/BubbleStyleSettings/BubbleStyleSettings.module.scss";

/** Каркас экрана настроек (как у «Вигляд повідомлень»): полноэкранный слой, «Назад», Esc закрывает. */
export default function PrefsScreen({
  title,
  backLabel,
  onClose,
  children,
}: {
  title: string;
  backLabel: string;
  onClose: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return createPortal(
    <div className={base.screen} role="dialog" aria-modal="true" aria-label={title}>
      <header className={base.screenHead}>
        <button type="button" className={base.back} onClick={onClose} aria-label={backLabel} autoFocus>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="m15 6-6 6 6 6" />
          </svg>
        </button>
        <h2 className={base.screenTitle}>{title}</h2>
      </header>
      <div className={base.screenBody}>
        <div className={base.body}>{children}</div>
      </div>
    </div>,
    document.body,
  );
}

/** Шеврон строки настроек. */
export function RowChevron() {
  return (
    <svg className={base.chevron} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m9 6 6 6-6 6" />
    </svg>
  );
}
