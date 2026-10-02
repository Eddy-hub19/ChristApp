"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { useTranslations } from "next-intl";
import { Check, Settings } from "lucide-react";
import type { PlayerAdapterHandle, StageQuality } from "./players/types";
import styles from "./CinemaHall.module.scss";

type StageQualityMenuProps = {
  stageRef: RefObject<PlayerAdapterHandle | null>;
  /** `mobile` — кнопка в оверлеї на відео (світла на темному), `desktop` — у панелі під екраном. */
  variant: "mobile" | "desktop";
  /** Викликається при взаємодії — мобільний оверлей за цим не дає собі сховатись. */
  onInteract?: () => void;
};

/**
 * Особисте налаштування якості (як гучність — не синхронізується з кімнатою).
 * Не рендериться, поки поточний провайдер не віддав ≥2 варіантів (YouTube/Dailymotion — ніколи).
 * Список питаємо опитуванням: HLS-рівні й Vimeo-якості з'являються вже після монтування плеєра.
 */
export default function StageQualityMenu({ stageRef, variant, onInteract }: StageQualityMenuProps) {
  const t = useTranslations("cinema.hall");
  const [qualities, setQualities] = useState<StageQuality[]>([]);
  const [current, setCurrent] = useState("auto");
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const read = () => {
      const stage = stageRef.current;
      const list = stage?.getQualities?.() ?? [];
      setQualities((prev) =>
        prev.length === list.length && prev.every((q, i) => q.id === list[i].id) ? prev : list,
      );
      setCurrent(stage?.getQuality?.() ?? "auto");
    };
    read();
    const id = setInterval(read, 1000);
    return () => clearInterval(id);
  }, [stageRef]);

  // Закриття по кліку/тапу поза меню та по Escape
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (qualities.length < 2) return null;
  const currentLabel = qualities.find((q) => q.id === current)?.label;

  return (
    <div ref={rootRef} className={styles.qualityRoot}>
      <button
        type="button"
        className={variant === "mobile" ? styles.mobileIconButton : styles.hallIconButton}
        aria-label={t("quality")}
        aria-haspopup="menu"
        aria-expanded={open}
        title={currentLabel ? `${t("quality")}: ${currentLabel}` : t("quality")}
        onClick={(e) => {
          e.stopPropagation();
          onInteract?.();
          setOpen((v) => !v);
        }}
      >
        <Settings size={18} />
      </button>
      {open ? (
        <ul className={styles.qualityMenu} role="menu" aria-label={t("quality")}>
          {qualities.map((q) => (
            <li key={q.id} role="none">
              <button
                type="button"
                role="menuitemradio"
                aria-checked={q.id === current}
                className={styles.qualityItem}
                onClick={(e) => {
                  e.stopPropagation();
                  onInteract?.();
                  stageRef.current?.setQuality?.(q.id);
                  setCurrent(q.id);
                  setOpen(false);
                }}
              >
                <span>{q.id === "auto" ? t("qualityAuto") : q.label}</span>
                {q.id === current ? <Check size={14} aria-hidden /> : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
