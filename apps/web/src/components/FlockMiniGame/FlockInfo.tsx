"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { BONUS_ICON_COMPONENTS, BonusIcon } from "@/components/icons/game";
import { artifactIconSrc } from "./flockArtifacts";
import { BONUS_ICON } from "./flockRender";
import type { FlockGameConfig } from "./flockApi";
import { artifactDescParams, fillInfoText, isInfoEntryVisible, INFO_SECTIONS, INFO_SECTION_META, type InfoEntry, type InfoLang, type InfoSection } from "./flockInfoData";
import { ICONS } from "./FlockWhatsNew";
import { WHATS_NEW } from "./flockWhatsNewData";
import { latestVersion } from "./flockWhatsNewLogic";
import FlockSheet from "./FlockSheet";
import styles from "./FlockInfo.module.scss";

type Props = {
  game?: FlockGameConfig;
  /** «Арена»: прогрес лічильника перемог над тигром (показується в записі про карту). */
  coliseum?: { wins: number; perSkin: number; toSkin: number };
  /** Последняя версия «Що нового», просмотренная ДО этого открытия игры: более новые помечаются «Нове». */
  seenBefore: number;
  /** Вкладка «Оновлення» открыта: считается просмотром. */
  onUpdatesViewed: (version: number) => void;
  onClose: () => void;
};

type Tab = "about" | "updates";

const LAST_UPDATES = 5;

function EntryIcon({ icon }: { icon: InfoEntry["icon"] }) {
  if (icon.startsWith("bonus:") && BONUS_ICON_COMPONENTS[icon.slice(6)]) return <BonusIcon kind={icon.slice(6)} size={28} />;
  if (icon.startsWith("bonus:")) return <span className={styles.emoji}>{BONUS_ICON[icon.slice(6)] ?? "?"}</span>;
  if (icon.startsWith("artifact:")) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={artifactIconSrc(Number(icon.slice(9))) ?? ""} alt="" width={30} height={30} loading="lazy" decoding="async" />;
  }
  return <>{ICONS[icon as keyof typeof ICONS]({ size: 28 })}</>;
}

/** Шторка (телефон) / окно (десктоп) «Про гру» с вкладками «Про гру» и «Оновлення». */
export default function FlockInfo({ game, coliseum, seenBefore, onUpdatesViewed, onClose }: Props) {
  const t = useTranslations("flock");
  const locale = useLocale();
  const lang: InfoLang = locale === "ru" || locale === "en" ? locale : "ua";
  const [tab, setTab] = useState<Tab>("about");
  const latest = latestVersion();
  const [openVersions, setOpenVersions] = useState<Set<number>>(() => new Set([latest]));
  /** «Про гру»: главный экран с плитками тем; открытая тема - `section`; поиск по всем темам - `query`. */
  const [section, setSection] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const reportedRef = useRef(false);

  useEffect(() => {
    if (tab !== "updates" || reportedRef.current) return;
    reportedRef.current = true;
    onUpdatesViewed(latest);
  }, [tab, latest, onUpdatesViewed]);

  const toggleVersion = (v: number) =>
    setOpenVersions((prev) => {
      const next = new Set(prev);
      if (next.has(v)) next.delete(v);
      else next.add(v);
      return next;
    });

  const visibleEntries = (sec: InfoSection) => sec.entries.filter((e) => isInfoEntryVisible(e, game));

  /** Название и текст записи (у артефактов - из переводов). */
  const entryView = (sec: InfoSection, e: InfoEntry) => {
    if (sec.artifacts) {
      const n = Number(e.icon.slice(9));
      return { title: t(`artifacts.items.${n}.name`), text: String(t(`artifacts.items.${n}.desc`, artifactDescParams(game))) };
    }
    return { title: e.title[lang], text: fillInfoText(e.text[lang], e.params, game) };
  };

  const renderEntry = (sec: InfoSection, e: InfoEntry, tag?: string) => {
    const v = entryView(sec, e);
    return (
      <li key={`${sec.id}-${e.id}`} className={styles.entry}>
        <span className={styles.icon}>
          <EntryIcon icon={e.icon} />
        </span>
        <span className={styles.entryText}>
          {tag ? <span className={styles.tag}>{tag}</span> : null}
          <strong>{v.title}</strong>
          <span>{v.text}</span>
          {e.id === "coliseum" && coliseum ? <strong>{t("coliseum.progress", { n: coliseum.toSkin, per: coliseum.perSkin })}</strong> : null}
        </span>
      </li>
    );
  };

  const q = query.trim().toLowerCase();
  const results = q
    ? INFO_SECTIONS.flatMap((sec) =>
        visibleEntries(sec)
          .filter((e) => {
            const v = entryView(sec, e);
            return v.title.toLowerCase().includes(q) || v.text.toLowerCase().includes(q);
          })
          .map((e) => ({ sec, e })),
      )
    : [];
  const current = section ? INFO_SECTIONS.find((x) => x.id === section) ?? null : null;

  const renderAbout = () => {
    if (q) {
      return results.length ? (
        <ul className={styles.list}>{results.map(({ sec, e }) => renderEntry(sec, e, sec.title[lang]))}</ul>
      ) : (
        <p className={styles.empty}>{t("info.empty")}</p>
      );
    }
    if (current) {
      const meta = INFO_SECTION_META[current.id];
      return (
        <div className={styles.detail}>
          <div className={styles.detailHead}>
            <button type="button" className={styles.back} onClick={() => setSection(null)} aria-label={t("info.back")} title={t("info.back")}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="m15 6-6 6 6 6" />
              </svg>
            </button>
            <span className={styles.detailIcon}>{ICONS[meta?.icon ?? "star"]({ size: 26 })}</span>
            <h3 className={styles.detailTitle}>{current.title[lang]}</h3>
          </div>
          {current.intro ? <p className={styles.intro}>{fillInfoText(current.intro.text[lang], current.intro.params, game)}</p> : null}
          <ul className={styles.list}>{visibleEntries(current).map((e) => renderEntry(current, e))}</ul>
        </div>
      );
    }
    return (
      <div className={styles.hub}>
        {INFO_SECTIONS.map((sec, i) => {
          const meta = INFO_SECTION_META[sec.id];
          return (
            <button key={sec.id} type="button" className={`${styles.tile} ${i === 0 ? styles.tileWide : ""}`} onClick={() => setSection(sec.id)}>
              <span className={styles.tileIcon}>{ICONS[meta?.icon ?? "star"]({ size: 30 })}</span>
              <span className={styles.tileTitle}>{sec.title[lang]}</span>
              {meta ? <span className={styles.tileHint}>{meta.hint[lang]}</span> : null}
              <span className={styles.tileCount}>{visibleEntries(sec).length}</span>
            </button>
          );
        })}
      </div>
    );
  };

  /** В «Оновленнях» показываем только последние обновления. */
  const entries = [...WHATS_NEW].sort((a, b) => b.version - a.version).slice(0, LAST_UPDATES);

  const renderTabs = (titleId: string) => (
    <div className={styles.tabs} role="tablist" aria-label={t("info.title")}>
      {(["about", "updates"] as const).map((id) => (
        <button
          key={id}
          type="button"
          role="tab"
          id={`${titleId}-tab-${id}`}
          aria-selected={tab === id}
          aria-controls={`${titleId}-panel`}
          className={`${styles.tab} ${tab === id ? styles.tabActive : ""}`}
          onClick={() => setTab(id)}
        >
          {t(id === "about" ? "info.tabAbout" : "info.tabUpdates")}
        </button>
      ))}
    </div>
  );

  return (
    <FlockSheet title={t("info.title")} closeLabel={t("info.close")} onClose={onClose} testId="flock-info" headBottom={renderTabs} bodyProps={(titleId) => ({ role: "tabpanel", id: `${titleId}-panel`, "aria-labelledby": `${titleId}-tab-${tab}` })}>
      {(titleId) => (
        <>
          {tab === "about"
            ? (
                <>
                  <label className={styles.search}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <circle cx="11" cy="11" r="7" />
                      <path d="m20 20-3.5-3.5" />
                    </svg>
                    <input type="search" value={query} onChange={(ev) => setQuery(ev.target.value)} placeholder={t("info.search")} aria-label={t("info.search")} />
                  </label>
                  {renderAbout()}
                </>
              )
            : entries.map((e) => {
                const open = openVersions.has(e.version);
                const fresh = e.version > seenBefore;
                return (
                  <section key={e.version} className={styles.version}>
                    <button type="button" className={styles.versionHead} aria-expanded={open} aria-controls={`${titleId}-v${e.version}`} onClick={() => toggleVersion(e.version)}>
                      <span className={styles.versionName}>{t("whatsNew.version", { version: e.version })}</span>
                      {fresh ? (
                        <span className={styles.fresh}>
                          <span className={styles.dot} aria-hidden />
                          {t("info.new")}
                        </span>
                      ) : null}
                      <span className={styles.versionDate}>{e.date}</span>
                      <svg className={`${styles.chevron} ${open ? styles.chevronOpen : ""}`} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="m6 9 6 6 6-6" />
                      </svg>
                    </button>
                    <div className={`${styles.collapse} ${open ? styles.collapseOpen : ""}`}>
                      <div id={`${titleId}-v${e.version}`} className={styles.collapseInner} inert={!open}>
                        <ul className={styles.list}>
                          {e.items.map((item, i) => (
                            <li key={i} className={styles.entry}>
                              <span className={styles.icon}>{ICONS[item.icon]({ size: 28 })}</span>
                              <span className={styles.entryText}>
                                <span>{item.text[lang]}</span>
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </section>
                );
              })}
        </>
      )}
    </FlockSheet>
  );
}
