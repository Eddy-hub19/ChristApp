"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Check, ChevronRight, X } from "lucide-react";
import SkinPreview from "./FlockSkinPreview";
import styles from "./FlockLobby.module.scss";

export type SkinTabKey = "regular" | "special" | "premium" | "legendary";

/** Состояние плитки в шторке «Усі обліки»: выбрана ли (рамка) и что делает нажатие. */
export type GridTile = { focused: boolean; onPick: () => void };

type Props = {
  /** Скин, который показываем в большой карточке: просматриваемый (ещё не куплен) или выбранный. */
  shownSkin: number;
  /** true - в карточке скин на просмотре (не куплен), false - выбранный. */
  previewing: boolean;
  /** Надетый сейчас скин и скин на просмотре (для шторки). */
  currentSkin: number;
  previewSkin: number | null;
  artifact: number;
  tabs: readonly { key: SkinTabKey; ids: readonly number[] }[];
  /** Скин доступен игроку (бесплатный или куплен): для счётчика «куплено/всего». */
  isOwned: (id: number) => boolean;
  /** Закрыт ли скин (платный и не куплен) / не в продаже («Скоро»). */
  isLocked: (id: number) => boolean;
  isSoon: (id: number) => boolean;
  /** Цена скина со значком валюты. */
  priceNode: (id: number) => ReactNode;
  /** Плитка скина (кнопка role=radio); с `grid` - вариант для шторки: цена под рисунком, нажатие - выбор в шторке. */
  renderTile: (id: number, grid?: GridTile) => ReactNode;
  /** Бонусы скина, если есть. */
  perks: (id: number) => ReactNode;
  /** Блок покупки (цена/кнопки), когда скин на просмотре. */
  buyBlock: (id: number) => ReactNode;
  /** Просмотр закрытого скина (без надевания) и надевание открытого. */
  onPeek: (id: number) => void;
  onSelect: (id: number) => void;
  /** Подсказка под вкладками (сбор коллекции «Преміум»). */
  tabHint?: (key: SkinTabKey) => ReactNode;
  skinName: (id: number) => string;
  /** Шторка открыта/закрыта: родитель прячет крестик игры. */
  onSheetChange?: (open: boolean) => void;
};

/**
 * Верх лобби «Отари»: компактная карточка выбранного облика, вкладки категорий (одна строка), горизонтальная
 * карусель плиток, кнопка «Усі» (полноэкранная шторка с сеткой выбранной категории).
 */
export default function FlockLobbySkins(p: Props) {
  const { shownSkin, previewing, artifact, tabs, isOwned, renderTile, perks, buyBlock, tabHint, skinName, onSheetChange } = p;
  const t = useTranslations("flock");
  const tabOf = (id: number) => tabs.find((x) => x.ids.includes(id))?.key ?? tabs[0].key;
  const [tab, setTab] = useState<SkinTabKey>(() => tabOf(shownSkin));
  const [allOpen, setAllOpen] = useState(false);
  const railRef = useRef<HTMLDivElement | null>(null);
  const active = tabs.find((x) => x.key === tab) ?? tabs[0];

  useEffect(() => {
    onSheetChange?.(allOpen);
  }, [allOpen, onSheetChange]);
  useEffect(() => () => onSheetChange?.(false), [onSheetChange]);

  // при смене вкладки показываем выбранный скин (если он в ней) без анимации прокрутки
  useLayoutEffect(() => {
    const rail = railRef.current;
    if (!rail) return;
    const el = rail.querySelector<HTMLElement>('[aria-checked="true"]');
    rail.scrollLeft = el ? Math.max(0, el.offsetLeft - 8) : 0;
  }, [tab]);

  const perkNode = perks(shownSkin);
  const locked = p.isLocked(shownSkin);

  return (
    <>
      <section className={styles.showcase} aria-label={t("lobby.selected")}>
        <div className={styles.showcasePreview}>
          <SkinPreview skinId={shownSkin} artifactId={artifact} size={84} />
        </div>
        <div className={styles.showcaseInfo}>
          <div className={styles.showcaseTop}>
            <span className={styles.showcaseLabel}>{previewing ? t("lobby.preview") : t("lobby.selected")}</span>
            <strong className={styles.showcaseName}>{skinName(shownSkin)}</strong>
          </div>
          <span className={styles.showcaseStatus}>
            {previewing ? null : (
              <span className={styles.currentChip}>
                {t("lobby.current")}
                <Check size={13} aria-hidden />
              </span>
            )}
            {locked ? (
              p.isSoon(shownSkin) ? (
                <span>{t("rubies.soon")}</span>
              ) : (
                <span className={styles.priceLine}>
                  {t("lobby.priceLabel")} {p.priceNode(shownSkin)}
                </span>
              )
            ) : !previewing && isOwnedPaid(shownSkin, tabs, isOwned) ? (
              <span className={styles.ownedLine}>{t("lobby.owned")}</span>
            ) : null}
          </span>
          {previewing ? buyBlock(shownSkin) : null}
          {perkNode}
        </div>
      </section>

      <SkinTabs tabs={tabs} tab={tab} onTab={setTab} isOwned={isOwned} />
      {tabHint?.(active.key)}

      <div className={styles.railRow}>
        <div ref={railRef} className={styles.rail} role="radiogroup" aria-label={labelOf(t, active.key)}>
          {active.ids.map((id) => renderTile(id))}
        </div>
        <button type="button" className={styles.allBtn} onClick={() => setAllOpen(true)} aria-haspopup="dialog">
          {t("lobby.all")}
          <ChevronRight size={16} aria-hidden />
        </button>
      </div>

      {allOpen ? <SkinsSheet {...p} initialTab={tab} onClose={() => setAllOpen(false)} /> : null}
    </>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function labelOf(t: any, key: SkinTabKey, short = false): string {
  if (key === "regular") return t("lobby.regular");
  if (key === "legendary" && short) return t("lobby.legendaryShort");
  return t(key);
}

function isOwnedPaid(id: number, tabs: Props["tabs"], isOwned: (id: number) => boolean): boolean {
  // платный = не из «Звичайних» бесплатных; признак «куплено» показываем только для особых/премиум/легендарных и купленных обычных
  return isOwned(id) && tabs.some((x) => x.key !== "regular" && x.ids.includes(id));
}

/** Вкладки категорий: одна высота, одна строка; счётчик «куплено/всего» - у активной вкладки; на узком экране короткие подписи. */
function SkinTabs({ tabs, tab, onTab, isOwned }: { tabs: Props["tabs"]; tab: SkinTabKey; onTab: (k: SkinTabKey) => void; isOwned: (id: number) => boolean }) {
  const t = useTranslations("flock");
  return (
    <div className={styles.tabs} role="tablist" aria-label={t("chooseSkin")}>
      {tabs.map((x) => {
        const have = x.ids.filter(isOwned).length;
        const on = tab === x.key;
        return (
          <button key={x.key} type="button" role="tab" aria-selected={on} className={`${styles.tab} ${on ? styles.tabActive : ""}`} onClick={() => onTab(x.key)} title={labelOf(t, x.key)}>
            <span className={styles.tabLabelFull}>{labelOf(t, x.key)}</span>
            <span className={styles.tabLabelShort}>{labelOf(t, x.key, true)}</span>
            {on && x.key !== "regular" ? (
              <span className={styles.tabCount} aria-label={t("lobby.ownedAria", { have, total: x.ids.length })}>
                {have}/{x.ids.length}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

/** Полноэкранная шторка «Усі обліки»: вкладки сверху, сетка категории, мини-превью выбранного и «Готово» внизу. */
function SkinsSheet({ tabs, initialTab, onClose, isOwned, isLocked, isSoon, priceNode, renderTile, perks, buyBlock, onPeek, onSelect, skinName, currentSkin, previewSkin, artifact, tabHint }: Props & { initialTab: SkinTabKey; onClose: () => void }) {
  const t = useTranslations("flock");
  const [tab, setTab] = useState<SkinTabKey>(initialTab);
  const [focus, setFocus] = useState<number>(previewSkin ?? currentSkin);
  const active = tabs.find((x) => x.key === tab) ?? tabs[0];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const pick = (id: number) => {
    setFocus(id);
    if (isLocked(id)) onPeek(id);
    else if (previewSkin !== null) onPeek(id); // открытый скин: сбросить просмотр закрытого, ничего не надевая
  };

  const locked = isLocked(focus);
  const soon = isSoon(focus);
  const isCurrent = !locked && currentSkin === focus;
  const perkNode = perks(focus);

  return (
    <div className={styles.sheet} role="dialog" aria-modal="true" aria-label={t("lobby.allTitle")} data-testid="flock-all-skins">
      <header className={styles.sheetHead}>
        <h2 className={styles.sheetTitle}>{t("lobby.allTitle")}</h2>
        <button type="button" className={styles.sheetClose} onClick={onClose} aria-label={t("lobby.closeAll")} autoFocus>
          <X size={20} aria-hidden />
        </button>
      </header>
      <div className={styles.sheetTabs}>
        <SkinTabs tabs={tabs} tab={tab} onTab={setTab} isOwned={isOwned} />
        {tabHint?.(active.key)}
      </div>
      <div className={styles.sheetScroll}>
        <div className={styles.allGrid} role="radiogroup" aria-label={labelOf(t, active.key)}>
          {active.ids.map((id) => renderTile(id, { focused: focus === id, onPick: () => pick(id) }))}
        </div>
      </div>
      <footer className={styles.sheetFoot}>
        <div className={styles.miniPreview}>
          <div className={styles.miniArt}>
            <SkinPreview skinId={focus} artifactId={artifact} size={52} />
          </div>
          <div className={styles.miniInfo}>
            <strong className={styles.miniName}>{skinName(focus)}</strong>
            <span className={styles.miniMeta}>
              {locked ? soon ? t("rubies.soon") : <span className={styles.priceLine}>{priceNode(focus)}</span> : isCurrent ? <span className={styles.ownedLine}>{t("lobby.current")}</span> : isOwnedPaid(focus, tabs, isOwned) ? <span className={styles.ownedLine}>{t("lobby.owned")}</span> : null}
            </span>
            {perkNode}
          </div>
          <div className={styles.miniAction}>
            {locked ? (
              soon ? (
                <button type="button" className={styles.miniBtn} disabled>
                  {t("rubies.soon")}
                </button>
              ) : previewSkin === focus ? (
                buyBlock(focus)
              ) : (
                <button type="button" className={styles.miniBtn} onClick={() => onPeek(focus)}>
                  {t("lobby.buy")}
                </button>
              )
            ) : (
              <button type="button" className={styles.miniBtn} disabled={isCurrent} onClick={() => onSelect(focus)}>
                {isCurrent ? t("lobby.current") : t("lobby.choose")}
              </button>
            )}
          </div>
        </div>
        <button type="button" className={styles.done} onClick={onClose}>
          {t("lobby.done")}
        </button>
      </footer>
    </div>
  );
}
