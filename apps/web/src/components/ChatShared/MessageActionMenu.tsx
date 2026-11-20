"use client";

import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { Copy, Download, Pin, PinOff, PenLine, Plus, Reply, Share, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import ReactionPicker from "./ReactionPicker";
import { buildQuickReactions, readRecentReactions, recordRecentReaction } from "./recentReactions";
import styles from "./ChatShared.module.scss";

const VIEWPORT_MARGIN = 8;
const ANCHOR_GAP = 8;
const BACKDROP_GRACE_MS = 400;

type MessageActionMenuProps = {
  /** Прямокутник бульбашки, біля якої відкривається меню. */
  anchorRect: DOMRect;
  reactions: readonly string[];
  /** Быстрый ряд из 6 последних использованных + кнопка «+» с полным списком (основные чаты). Без флага - фиксированный `reactions` (Киношка). */
  extendedReactions?: boolean;
  /** Реакції, які вже поставив поточний користувач (підсвічуються). */
  myReactions?: ReadonlySet<string>;
  onReact: (emoji: string) => void;
  onReply?: () => void;
  /** Текст для "Копіювати"; без нього пункт ховається. */
  copyText?: string;
  /** "Відкрити в…" (Web Share з файлом) або "Завантажити" — для файлових повідомлень (книги). */
  onShare?: () => void;
  shareMode?: "share" | "download";
  onEdit?: () => void;
  /** «Закрепить» / «Открепить» (если задано; в Киношке не нужно). */
  onTogglePin?: () => void;
  isPinned?: boolean;
  onDelete?: () => void;
  onClose: () => void;
};

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const area = document.createElement("textarea");
      area.value = text;
      area.setAttribute("readonly", "");
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.appendChild(area);
      area.select();
      const ok = document.execCommand("copy");
      area.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

/** Меню дій над повідомленням: ряд реакцій зверху, дії знизу. Однакове в усіх чатах. */
export default function MessageActionMenu({
  anchorRect,
  reactions,
  extendedReactions = false,
  myReactions,
  onReact,
  onReply,
  copyText,
  onShare,
  shareMode = "download",
  onEdit,
  onTogglePin,
  isPinned = false,
  onDelete,
  onClose,
}: MessageActionMenuProps) {
  const t = useTranslations("chatShared");
  const menuRef = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState<CSSProperties>({ visibility: "hidden" });
  const [copied, setCopied] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  // Недавние читаем при открытии меню (localStorage), быстрый ряд строится из них.
  const [recent] = useState<string[]>(() => (extendedReactions && typeof window !== "undefined" ? readRecentReactions() : []));
  const quickRow = useMemo(() => (extendedReactions ? buildQuickReactions(recent) : [...reactions]), [extendedReactions, recent, reactions]);
  const openedAtRef = useRef(0);
  useEffect(() => {
    openedAtRef.current = Date.now();
  }, []);

  // Відпускання пальця після довгого тапу може віддати click прямо в підкладку — не закриваємо меню одразу.
  const handleBackdropClick = () => {
    if (Date.now() - openedAtRef.current < BACKDROP_GRACE_MS) return;
    onClose();
  };

  useLayoutEffect(() => {
    const menu = menuRef.current;
    if (!menu) return;
    const { width, height } = menu.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.visualViewport?.height ?? window.innerHeight;
    const centerX = anchorRect.left + anchorRect.width / 2;
    const left = Math.min(
      Math.max(VIEWPORT_MARGIN, centerX - width / 2),
      Math.max(VIEWPORT_MARGIN, vw - width - VIEWPORT_MARGIN),
    );
    const below = anchorRect.bottom + ANCHOR_GAP;
    const above = anchorRect.top - ANCHOR_GAP - height;
    let top = below + height <= vh - VIEWPORT_MARGIN ? below : above;
    top = Math.min(Math.max(VIEWPORT_MARGIN, top), Math.max(VIEWPORT_MARGIN, vh - height - VIEWPORT_MARGIN));
    setStyle({ left, top, visibility: "visible" });
  }, [anchorRect, pickerOpen]);

  // Клик вне панели реакций (но внутри меню) сворачивает её; подложка по-прежнему закрывает всё меню.
  useEffect(() => {
    if (!pickerOpen) return;
    const onDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("[data-reaction-panel], [data-reaction-plus]")) return;
      setPickerOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [pickerOpen]);

  const react = (emoji: string) => {
    if (extendedReactions) recordRecentReaction(emoji);
    onReact(emoji);
    onClose();
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const run = (action: () => void) => () => {
    action();
    onClose();
  };

  const actions: Array<{ key: string; label: string; icon: ReactNode; danger?: boolean; onClick: () => void }> = [];
  if (onReply) {
    actions.push({ key: "reply", label: t("reply"), icon: <Reply size={17} />, onClick: run(onReply) });
  }
  if (copyText) {
    actions.push({
      key: "copy",
      label: copied ? t("copied") : t("copy"),
      icon: <Copy size={17} />,
      onClick: () => {
        void copyToClipboard(copyText).then((ok) => {
          if (!ok) return onClose();
          setCopied(true);
          window.setTimeout(onClose, 450);
        });
      },
    });
  }
  if (onShare) {
    actions.push({
      key: "share",
      label: shareMode === "share" ? t("openIn") : t("download"),
      icon: shareMode === "share" ? <Share size={17} /> : <Download size={17} />,
      onClick: run(onShare),
    });
  }
  if (onTogglePin) {
    actions.push({
      key: "pin",
      label: isPinned ? t("unpin") : t("pin"),
      icon: isPinned ? <PinOff size={17} /> : <Pin size={17} />,
      onClick: run(onTogglePin),
    });
  }
  if (onEdit) {
    actions.push({ key: "edit", label: t("edit"), icon: <PenLine size={17} />, onClick: run(onEdit) });
  }
  if (onDelete) {
    actions.push({ key: "delete", label: t("delete"), icon: <Trash2 size={17} />, danger: true, onClick: run(onDelete) });
  }

  return createPortal(
    <div className={styles.menuLayer} data-app-overlay>
      <button type="button" className={styles.menuBackdrop} aria-label={t("closeMenu")} onClick={handleBackdropClick} />
      <div ref={menuRef} className={styles.menu} style={style} role="menu" aria-label={t("messageMenu")}>
        <div className={styles.menuReactions}>
          {quickRow.map((emoji) => (
            <button
              key={emoji}
              type="button"
              role="menuitem"
              className={`${styles.menuReaction} ${myReactions?.has(emoji) ? styles.menuReactionActive : ""}`}
              onClick={() => react(emoji)}
            >
              {emoji}
            </button>
          ))}
          {extendedReactions ? (
            <button
              type="button"
              role="menuitem"
              data-reaction-plus
              className={`${styles.menuReaction} ${styles.menuReactionPlus}`}
              aria-expanded={pickerOpen}
              aria-label={t("reactionMore")}
              onClick={() => setPickerOpen((open) => !open)}
            >
              <Plus size={18} />
            </button>
          ) : null}
        </div>
        {extendedReactions && pickerOpen ? <ReactionPicker recent={recent} onPick={react} /> : null}
        {actions.length > 0 ? (
          <div className={styles.menuActions}>
            {actions.map((action) => (
              <button
                key={action.key}
                type="button"
                role="menuitem"
                className={`${styles.menuAction} ${action.danger ? styles.menuActionDanger : ""}`}
                onClick={action.onClick}
              >
                {action.icon}
                <span>{action.label}</span>
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
