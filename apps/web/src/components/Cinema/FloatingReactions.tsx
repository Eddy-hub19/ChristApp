"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import PersonAvatar from "./PersonAvatar";
import type { HallMember, HallReaction } from "./useWatchHall";
import styles from "./CinemaHall.module.scss";

const MAX_ON_SCREEN = 30;
/** Якщо шар ще не встиг відрендеритись (clientHeight === 0) — розумний запасний варіант. */
const FALLBACK_RISE_PX = 640;
/** Якщо відлуння власної реакції не прийшло (втрата пакета) — не блокувати дедуп навічно. */
const PENDING_ECHO_TIMEOUT_MS = 5000;

type Floating = HallReaction & {
  leftPct: number;
  topPx: number;
  risePx: number;
  durationMs: number;
  swayMs: number;
  swayPx: number;
  rotStart: number;
  rotEnd: number;
  scalePeak: number;
  scaleEnd: number;
  /** Аватарку показуємо тільки для чужих реакцій — свою й так щойно натиснув сам. */
  avatarUser: HallMember | undefined;
};

export type FloatingReactionsHandle = {
  /**
   * Миттєвий, оптимістичний власний емодзі — не чекаючи відлуння з сервера.
   * `expectEcho=false`, якщо мережевий emit взагалі не пішов (клієнтський рейт-ліміт
   * в useWatchHall.sendReaction) — інакше лічильник дедупу назавжди "завис" би.
   */
  spawnLocal: (emoji: string, originRect: DOMRect | null, expectEcho: boolean) => void;
};

type FloatingReactionsProps = {
  subscribe: (listener: (r: HallReaction) => void) => () => void;
  currentUserId: string | undefined;
  members: HallMember[];
};

function prefersReducedMotion() {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v));
}

/**
 * Летючі емодзі-реакції: спливають від низу екрана (де панель емодзі в чаті) і летять
 * угору через весь екран, поверх плеєра — включно з fullscreen і псевдо-fullscreen на iPhone.
 * Шар живе всередині .theater й покладається на те, що жоден його предок аж до .theater
 * не має свого transform/filter/backdrop-filter: САМЕ .theaterPseudoFullscreenRotated (transform:
 * rotate) навмисно стає containing block для нашого position:fixed — так шар обертається разом
 * із відео. Якщо колись комусь знадобиться transform/filter/backdrop-filter на .screenGlow,
 * .curtain чи іншому предку між .theater і цим шаром — position:fixed тут стане відносним ДО
 * НЬОГО, а не до екрана, і шар перестане покривати весь viewport. Перевіряйте це вручну (як
 * зроблено в стадії 0 — скріншот + поворот через sips), автотесту на це немає.
 * Подія watch:reaction ніде не зберігається — це суто ефемерна анімація на клієнті.
 */
const FloatingReactions = forwardRef<FloatingReactionsHandle, FloatingReactionsProps>(
  function FloatingReactions({ subscribe, currentUserId, members }, ref) {
    const layerRef = useRef<HTMLDivElement>(null);
    const [items, setItems] = useState<Floating[]>([]);
    const idCounter = useRef(0);
    /** emoji → скільки власних оптимістичних показів ще чекають на відлуння з сервера. */
    const pendingSelf = useRef(new Map<string, number>());

    const membersById = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);

    const spawnItem = useCallback(
      (reaction: HallReaction, originRect: DOMRect | null, isSelf: boolean) => {
        const layerEl = layerRef.current;
        const clientHeight = layerEl?.clientHeight || FALLBACK_RISE_PX;
        const layerRect = layerEl?.getBoundingClientRect();
        const reduced = prefersReducedMotion();

        let leftPct: number;
        let topPx: number;
        if (originRect && layerRect && layerRect.width > 0 && layerRect.height > 0) {
          // getBoundingClientRect повертає реальні екранні пікселі для обох елементів, тож частка
          // позиції кнопки всередині шару коректна незалежно від того, повернутий шар чи ні —
          // рахувати градуси повороту вручну не треба.
          const cx = originRect.left + originRect.width / 2;
          const cy = originRect.top + originRect.height / 2;
          leftPct = clamp(((cx - layerRect.left) / layerRect.width) * 100, 3, 97);
          const topFrac = clamp((cy - layerRect.top) / layerRect.height, 0.03, 0.97);
          topPx = topFrac * clientHeight;
        } else {
          // Чужа реакція (або власна без відомої точки) — з низу екрана, випадковий розкид.
          leftPct = 18 + Math.random() * 64;
          topPx = clientHeight * 0.94;
        }

        const item: Floating = {
          ...reaction,
          leftPct,
          topPx,
          risePx: Math.max(120, topPx),
          durationMs: reduced ? 900 : 2500 + Math.random() * 1500,
          swayMs: 700 + Math.random() * 600,
          swayPx: 10 + Math.random() * 16,
          rotStart: (Math.random() - 0.5) * 30,
          rotEnd: (Math.random() - 0.5) * 40,
          scalePeak: 1.1 + Math.random() * 0.25,
          scaleEnd: 0.72 + Math.random() * 0.2,
          avatarUser: isSelf ? undefined : membersById.get(reaction.userId),
        };
        // FIFO-витіснення: якщо на екрані вже ліміт, найстаріші зникають раніше за таймер.
        setItems((prev) => [...prev.slice(-(MAX_ON_SCREEN - 1)), item]);
        window.setTimeout(() => {
          setItems((prev) => prev.filter((p) => p.id !== item.id));
        }, item.durationMs + 150);
      },
      [membersById],
    );

    useEffect(
      () =>
        subscribe((reaction) => {
          if (currentUserId && reaction.userId === currentUserId) {
            const n = pendingSelf.current.get(reaction.emoji) ?? 0;
            if (n > 0) {
              // Це відлуння нашого ж оптимістичного тапу — вже показали, вдруге не треба.
              pendingSelf.current.set(reaction.emoji, n - 1);
              return;
            }
          }
          spawnItem(reaction, null, reaction.userId === currentUserId);
        }),
      [subscribe, currentUserId, spawnItem],
    );

    useImperativeHandle(
      ref,
      () => ({
        spawnLocal: (emoji, originRect, expectEcho) => {
          if (expectEcho) {
            pendingSelf.current.set(emoji, (pendingSelf.current.get(emoji) ?? 0) + 1);
            window.setTimeout(() => {
              const n = pendingSelf.current.get(emoji) ?? 0;
              if (n > 0) pendingSelf.current.set(emoji, n - 1);
            }, PENDING_ECHO_TIMEOUT_MS);
          }
          const id = `local-${Date.now()}-${idCounter.current++}`;
          spawnItem({ id, emoji, userId: currentUserId ?? "" }, originRect, true);
        },
      }),
      [spawnItem, currentUserId],
    );

    return (
      <div ref={layerRef} className={styles.reactionsLayer} aria-hidden>
        {items.map((item) => (
          <div
            key={item.id}
            className={styles.floatingEmoji}
            style={
              {
                left: `${item.leftPct}%`,
                top: `${item.topPx}px`,
                "--dur": `${item.durationMs}ms`,
                "--rise": `${item.risePx}px`,
                "--rot-start": `${item.rotStart}deg`,
                "--rot-end": `${item.rotEnd}deg`,
                "--scale-peak": item.scalePeak,
                "--scale-end": item.scaleEnd,
              } as CSSProperties
            }
          >
            <div
              className={styles.floatingEmojiSway}
              style={
                {
                  "--sway-dur": `${item.swayMs}ms`,
                  "--sway": `${item.swayPx}px`,
                } as CSSProperties
              }
            >
              {item.emoji}
              {item.avatarUser ? (
                <span className={styles.floatingEmojiAvatar}>
                  <PersonAvatar user={item.avatarUser} size={17} />
                </span>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    );
  },
);

export default FloatingReactions;
