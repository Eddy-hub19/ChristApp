"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Check, ChevronRight } from "lucide-react";
import FlockSheet from "./FlockSheet";
import SkinPreview from "./FlockSkinPreview";
import styles from "./FlockLobby.module.scss";

export type SkinTabKey = "regular" | "special" | "premium" | "legendary";

type Props = {
  /** Скин, который показываем в большой карточке: просматриваемый (ещё не куплен) или выбранный. */
  shownSkin: number;
  /** true - в карточке скин на просмотре (не куплен), false - выбранный. */
  previewing: boolean;
  artifact: number;
  tabs: readonly { key: SkinTabKey; ids: readonly number[] }[];
  /** Скин доступен игроку (бесплатный или куплен): для счётчика «куплено/всего». */
  isOwned: (id: number) => boolean;
  /** Плитка скина (кнопка role=radio с ценой и замочком), та же, что и раньше. */
  renderTile: (id: number) => ReactNode;
  /** Бонусы скина, если есть. */
  perks: (id: number) => ReactNode;
  /** Блок покупки (цена/кнопки), когда скин на просмотре. */
  buyBlock: ReactNode;
  /** Подсказка под каруселью вкладки (сбор коллекции «Преміум»). */
  tabHint?: (key: SkinTabKey) => ReactNode;
  skinName: (id: number) => string;
};

/**
 * Верх лобби «Отари»: большая карточка выбранного облика, вкладки категорий, горизонтальная карусель плиток
 * («N з M» вместо точек), кнопка «Усі» (полный список в шторке). Покупка и выбор - логика родителя (renderTile / buyBlock).
 */
export default function FlockLobbySkins({ shownSkin, previewing, artifact, tabs, isOwned, renderTile, perks, buyBlock, tabHint, skinName }: Props) {
  const t = useTranslations("flock");
  const tabOf = (id: number) => tabs.find((x) => x.ids.includes(id))?.key ?? tabs[0].key;
  const [tab, setTab] = useState<SkinTabKey>(() => tabOf(shownSkin));
  const [allOpen, setAllOpen] = useState(false);
  const [pos, setPos] = useState(0);
  const railRef = useRef<HTMLDivElement | null>(null);
  const active = tabs.find((x) => x.key === tab) ?? tabs[0];
  const label = (key: SkinTabKey) => t(key === "regular" ? "lobby.regular" : key);

  // «N з M»: сколько плиток справа от начала уже вошло в видимую область (последняя целиком видимая)
  const measure = useCallback(() => {
    const rail = railRef.current;
    if (!rail) return;
    const edge = rail.scrollLeft + rail.clientWidth + 2;
    let n = 0;
    for (const el of Array.from(rail.children) as HTMLElement[]) {
      if (el.offsetLeft + el.offsetWidth <= edge) n++;
    }
    setPos(Math.max(1, n));
  }, []);

  // при смене вкладки показываем выбранный скин (если он в ней) без анимации прокрутки
  useLayoutEffect(() => {
    const rail = railRef.current;
    if (!rail) return;
    const el = rail.querySelector<HTMLElement>('[aria-checked="true"]');
    rail.scrollLeft = el ? Math.max(0, el.offsetLeft - 8) : 0;
    const raf = requestAnimationFrame(measure);
    return () => cancelAnimationFrame(raf);
  }, [tab, measure]);

  useEffect(() => {
    const rail = railRef.current;
    if (!rail) return;
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(measure);
    };
    rail.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      cancelAnimationFrame(raf);
      rail.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [measure]);

  const perkNode = perks(shownSkin);

  return (
    <>
      <section className={styles.showcase} aria-label={t("lobby.selected")}>
        <div className={styles.showcasePreview}>
          <SkinPreview skinId={shownSkin} artifactId={artifact} size={104} />
        </div>
        <div className={styles.showcaseInfo}>
          <span className={styles.showcaseLabel}>{previewing ? t("lobby.preview") : t("lobby.selected")}</span>
          <strong className={styles.showcaseName}>{skinName(shownSkin)}</strong>
          {previewing ? (
            buyBlock
          ) : (
            <span className={styles.currentChip}>
              {t("lobby.current")}
              <Check size={14} aria-hidden />
            </span>
          )}
          {perkNode}
        </div>
      </section>

      <div className={styles.tabs} role="tablist" aria-label={t("chooseSkin")}>
        {tabs.map((x) => {
          const have = x.ids.filter(isOwned).length;
          return (
            <button key={x.key} type="button" role="tab" aria-selected={tab === x.key} className={`${styles.tab} ${tab === x.key ? styles.tabActive : ""}`} onClick={() => setTab(x.key)}>
              {label(x.key)}
              {x.key !== "regular" ? (
                <span className={styles.tabCount} aria-label={t("lobby.ownedAria", { have, total: x.ids.length })}>
                  {have}/{x.ids.length}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      <div className={styles.railRow}>
        <div ref={railRef} className={styles.rail} role="radiogroup" aria-label={label(active.key)}>
          {active.ids.map((id) => renderTile(id))}
        </div>
        <button type="button" className={styles.allBtn} onClick={() => setAllOpen(true)} aria-haspopup="dialog">
          {t("lobby.all")}
          <ChevronRight size={16} aria-hidden />
        </button>
      </div>
      <p className={styles.railPos} aria-live="off">
        {t("lobby.position", { n: Math.max(1, Math.min(pos, active.ids.length)), m: active.ids.length })}
      </p>
      {tabHint?.(active.key)}

      {allOpen ? (
        <FlockSheet title={t("lobby.allTitle")} closeLabel={t("lobby.closeAll")} onClose={() => setAllOpen(false)} testId="flock-all-skins">
          {() => (
            <div className={styles.allBody} onClick={(e) => (e.target as HTMLElement).closest("button") && setAllOpen(false)}>
              {tabs.map((x) => (
                <section key={x.key}>
                  <h3 className={styles.allHead}>
                    {label(x.key)}
                    {x.key !== "regular" ? (
                      <span className={styles.tabCount}>
                        {x.ids.filter(isOwned).length}/{x.ids.length}
                      </span>
                    ) : null}
                  </h3>
                  <div className={styles.allGrid} role="radiogroup" aria-label={label(x.key)}>
                    {x.ids.map((id) => renderTile(id))}
                  </div>
                </section>
              ))}
            </div>
          )}
        </FlockSheet>
      ) : null}
    </>
  );
}
