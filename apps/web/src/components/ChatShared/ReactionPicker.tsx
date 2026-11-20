"use client";

import { memo, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Search } from "lucide-react";
import { REACTION_CATEGORIES, type ReactionCategoryId } from "./reactionCatalog";
import styles from "./ChatShared.module.scss";

type ReactionPickerProps = {
  /** Последние использованные (новые первыми): отдельная вкладка. */
  recent: readonly string[];
  onPick: (emoji: string) => void;
};

type TabId = ReactionCategoryId | "recent";

/** Полный список реакций: вкладки категорий, «Недавние», поиск по названию (ru, ua, en); системные эмодзи. */
function ReactionPicker({ recent, onPick }: ReactionPickerProps) {
  const t = useTranslations("chatShared");
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<TabId>(recent.length > 0 ? "recent" : "faces");

  const normalized = query.trim().toLowerCase();
  const visible = useMemo(() => {
    if (normalized) {
      const found: string[] = [];
      for (const category of REACTION_CATEGORIES) {
        for (const entry of category.emojis) {
          if (entry.k.toLowerCase().includes(normalized)) found.push(entry.e);
        }
      }
      return found;
    }
    if (tab === "recent") return [...recent];
    return REACTION_CATEGORIES.find((category) => category.id === tab)?.emojis.map((entry) => entry.e) ?? [];
  }, [normalized, tab, recent]);

  const tabs: TabId[] = ["recent", ...REACTION_CATEGORIES.map((category) => category.id)];

  return (
    <div className={styles.reactionPanel} data-reaction-panel>
      <label className={styles.reactionSearch}>
        <Search size={15} aria-hidden />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t("reactionSearch")}
          aria-label={t("reactionSearch")}
          className={styles.reactionSearchInput}
        />
      </label>
      {normalized ? null : (
        <div className={styles.reactionTabs} role="tablist">
          {tabs.map((id) =>
            id === "recent" && recent.length === 0 ? null : (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={tab === id}
                className={`${styles.reactionTab} ${tab === id ? styles.reactionTabActive : ""}`}
                onClick={() => setTab(id)}
              >
                {t(`reactionCat.${id}`)}
              </button>
            ),
          )}
        </div>
      )}
      <div className={styles.reactionGrid} role="menu">
        {visible.length === 0 ? (
          <p className={styles.reactionEmpty}>{t("reactionNoResults")}</p>
        ) : (
          visible.map((emoji) => (
            <button key={emoji} type="button" role="menuitem" className={styles.reactionCell} onClick={() => onPick(emoji)}>
              {emoji}
            </button>
          ))
        )}
      </div>
    </div>
  );
}

export default memo(ReactionPicker);
