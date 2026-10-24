"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { EagleEyeIcon } from "@/components/icons/game";
import { artifactIconSrc } from "./flockArtifacts";
import { BONUS_ICON } from "./flockRender";
import type { FlockGameConfig } from "./flockApi";
import { artifactDescParams, fillInfoText, INFO_SECTIONS, type InfoEntry, type InfoLang } from "./flockInfoData";
import { ICONS } from "./FlockWhatsNew";
import { WHATS_NEW } from "./flockWhatsNewData";
import { latestVersion } from "./flockWhatsNewLogic";
import FlockSheet from "./FlockSheet";
import styles from "./FlockInfo.module.scss";

type Props = {
  game?: FlockGameConfig;
  /** Последняя версия «Що нового», просмотренная ДО этого открытия игры: более новые помечаются «Нове». */
  seenBefore: number;
  /** Вкладка «Оновлення» открыта: считается просмотром. */
  onUpdatesViewed: (version: number) => void;
  onClose: () => void;
};

type Tab = "about" | "updates";

function EntryIcon({ icon }: { icon: InfoEntry["icon"] }) {
  if (icon === "bonus:eagle") return <EagleEyeIcon size={28} />;
  if (icon.startsWith("bonus:")) return <span className={styles.emoji}>{BONUS_ICON[icon.slice(6)] ?? "?"}</span>;
  if (icon.startsWith("artifact:")) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={artifactIconSrc(Number(icon.slice(9))) ?? ""} alt="" width={30} height={30} loading="lazy" decoding="async" />;
  }
  return <>{ICONS[icon as keyof typeof ICONS]({ size: 28 })}</>;
}

/** Шторка (телефон) / окно (десктоп) «Про гру» с вкладками «Про гру» и «Оновлення». */
export default function FlockInfo({ game, seenBefore, onUpdatesViewed, onClose }: Props) {
  const t = useTranslations("flock");
  const locale = useLocale();
  const lang: InfoLang = locale === "ru" || locale === "en" ? locale : "ua";
  const [tab, setTab] = useState<Tab>("about");
  const latest = latestVersion();
  const [openVersions, setOpenVersions] = useState<Set<number>>(() => new Set([latest]));
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

  const entries = [...WHATS_NEW].sort((a, b) => b.version - a.version);

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
            ? INFO_SECTIONS.map((s) => (
                <section key={s.id} className={styles.section}>
                  <h3 className={styles.sectionTitle}>{s.title[lang]}</h3>
                  {s.intro ? <p className={styles.intro}>{fillInfoText(s.intro.text[lang], s.intro.params, game)}</p> : null}
                  <ul className={styles.list}>
                    {s.entries.map((e) => {
                      const n = s.artifacts ? Number(e.icon.slice(9)) : 0;
                      return (
                        <li key={e.id} className={styles.entry}>
                          <span className={styles.icon}>
                            <EntryIcon icon={e.icon} />
                          </span>
                          <span className={styles.entryText}>
                            <strong>{s.artifacts ? t(`artifacts.items.${n}.name`) : e.title[lang]}</strong>
                            <span>{s.artifacts ? t(`artifacts.items.${n}.desc`, artifactDescParams(game)) : fillInfoText(e.text[lang], e.params, game)}</span>
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ))
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
