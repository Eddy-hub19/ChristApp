"use client";

import { useCallback, useEffect, useRef, type ComponentType } from "react";
import { useLocale } from "next-intl";
import { X } from "lucide-react";
import { useCinema } from "@/components/Cinema/CinemaProvider";
import { ArtifactShieldIcon, EmeraldIcon, FlockIcon, QuestScrollIcon, TrophyIcon, type ColorIconProps } from "@/components/icons/game";
import { fetchAnnouncement, markAnnouncementSeen } from "@/components/FlockMiniGame/flockApi";
import { usePathname, useRouter } from "@/i18n/navigation";
import { AUTH_CHANGED_EVENT, getAuthToken } from "@/lib/auth";
import {
  ANNOUNCEMENT_SEEN_KEY,
  announcementMayApply,
  localAnnouncementSeen,
  setAnnouncementGate,
  useAnnouncementGate,
} from "./announcementGate";
import { ANNOUNCEMENT_UI, latestAnnouncement, type AnnouncementIcon, type AnnouncementLang } from "./otaraAnnouncementData";
import styles from "./OtaraAnnouncement.module.scss";

const ICONS: Record<AnnouncementIcon, ComponentType<ColorIconProps>> = {
  quests: QuestScrollIcon,
  arena: TrophyIcon,
  shield: ArtifactShieldIcon,
  emerald: EmeraldIcon,
};

/** Главные экраны: список чатов, Библия, Киношка, профиль и т.п. (не комнаты, не чтение, не игра, не вход). */
const MAIN_PATHS = new Set(["/", "/chat", "/bible", "/cinema", "/movie", "/profile", "/dashboard", "/games"]);

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Окно-объявление об обновлении «Отари» при входе: один раз на версию (версия - на сервере в профиле игры, запасной вариант - localStorage),
 * на первом главном экране, не больше одного окна за запуск (приоритетнее общей плашки «Що нового»).
 */
export default function OtaraAnnouncement() {
  const locale = useLocale();
  const lang: AnnouncementLang = locale === "ru" || locale === "en" ? locale : "ua";
  const pathname = usePathname();
  const router = useRouter();
  const gate = useAnnouncementGate();
  const { activeRoomId } = useCinema();
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const decidingRef = useRef(false);
  const announcement = latestAnnouncement();

  // вход/выход из аккаунта: пересчитать, нужно ли решать про объявление
  useEffect(() => {
    const check = () => setAnnouncementGate(announcementMayApply() ? "pending" : "none");
    window.addEventListener(AUTH_CHANGED_EVENT, check);
    return () => window.removeEventListener(AUTH_CHANGED_EVENT, check);
  }, []);

  // решение на главном экране (не во время просмотра в кинотеатре); один лёгкий запрос за запуск
  useEffect(() => {
    if (gate !== "pending" || !announcement || decidingRef.current) return;
    if (!MAIN_PATHS.has(pathname) || activeRoomId !== null || !getAuthToken()) return;
    decidingRef.current = true;
    void (async () => {
      try {
        const info = await fetchAnnouncement();
        if (info.seen >= announcement.version) {
          try {
            localStorage.setItem(ANNOUNCEMENT_SEEN_KEY, String(info.seen));
          } catch {
            /* приватный режим */
          }
          setAnnouncementGate("none");
        } else if (info.gameSeen >= announcement.gameVersion || !info.hasChats) {
          // уже видел обновление в лобби / новичок без чатов: не показываем (версию не помечаем у новичка: ему покажется позже)
          setAnnouncementGate("none");
        } else {
          returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
          setAnnouncementGate("show");
        }
      } catch {
        setAnnouncementGate("none");
      } finally {
        decidingRef.current = false;
      }
    })();
  }, [gate, pathname, activeRoomId, announcement]);

  const finish = useCallback(
    (goToGame: boolean) => {
      if (!announcement) return;
      try {
        localStorage.setItem(ANNOUNCEMENT_SEEN_KEY, String(Math.max(localAnnouncementSeen(), announcement.version)));
      } catch {
        /* приватный режим */
      }
      void markAnnouncementSeen(announcement.version).catch(() => undefined);
      setAnnouncementGate("shown");
      if (goToGame) router.push(announcement.target);
      else returnFocusRef.current?.focus?.();
    },
    [announcement, router],
  );

  // фокус в окно, ловушка Tab, Escape
  useEffect(() => {
    if (gate !== "show") return;
    const root = dialogRef.current;
    root?.querySelector<HTMLElement>("[data-primary]")?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        finish(false);
        return;
      }
      if (e.key !== "Tab" || !root) return;
      const nodes = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (nodes.length === 0) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [gate, finish]);

  if (gate !== "show" || !announcement) return null;
  const ui = ANNOUNCEMENT_UI[lang];
  const title = announcement.title[lang];

  return (
    <div className={styles.wrap} data-testid="otara-announcement">
      <div ref={dialogRef} className={styles.card} role="dialog" aria-modal="true" aria-labelledby="otara-ann-title" aria-describedby="otara-ann-sub">
        <button type="button" className={styles.close} aria-label={ui.close} onClick={() => finish(false)}>
          <X size={18} aria-hidden />
        </button>
        <div className={styles.hero}>
          <span className={styles.gameIcon} aria-hidden>
            <FlockIcon size={56} />
          </span>
          <h2 id="otara-ann-title" className={styles.title}>
            {title}
          </h2>
          <p id="otara-ann-sub" className={styles.sub}>
            {announcement.subtitle[lang]}
          </p>
        </div>
        <ul className={styles.list}>
          {announcement.items.map((item, i) => {
            const Icon = ICONS[item.icon];
            return (
              <li key={i} className={styles.item}>
                <span className={styles.itemIcon} aria-hidden>
                  <Icon size={28} />
                </span>
                <span>{item.text[lang]}</span>
              </li>
            );
          })}
        </ul>
        <div className={styles.actions}>
          <button type="button" className={styles.cta} data-primary onClick={() => finish(true)}>
            {ui.cta}
          </button>
          <button type="button" className={styles.later} onClick={() => finish(false)}>
            {ui.later}
          </button>
        </div>
      </div>
    </div>
  );
}
