"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Check, Search } from "lucide-react";
import PersonAvatar from "./PersonAvatar";
import type { DirectoryPerson } from "./usePeopleDirectory";
import styles from "./Cinema.module.scss";

type PeoplePickerProps = {
  people: DirectoryPerson[];
  isLoading?: boolean;
  selectedIds: Set<string>;
  onToggle: (userId: string) => void;
  /** userId → підпис замість чекбокса (уже в кімнаті / уже запрошено). */
  lockedLabels?: Map<string, string>;
};

export default function PeoplePicker({
  people,
  isLoading,
  selectedIds,
  onToggle,
  lockedLabels,
}: PeoplePickerProps) {
  const t = useTranslations("cinema.people");
  const [query, setQuery] = useState("");

  const { partners, others } = useMemo(() => {
    const needle = query.trim().toLowerCase().replace(/^@/, "");
    const matches = needle
      ? people.filter(
          (p) =>
            p.username.toLowerCase().includes(needle) ||
            (p.nickname ?? "").toLowerCase().includes(needle),
        )
      : people;
    return {
      partners: matches.filter((p) => p.isChatPartner),
      others: matches.filter((p) => !p.isChatPartner),
    };
  }, [people, query]);

  const renderPerson = (person: DirectoryPerson) => {
    const locked = lockedLabels?.get(person.id);
    const selected = selectedIds.has(person.id);
    return (
      <li key={person.id}>
        <button
          type="button"
          className={`${styles.personRow} ${selected ? styles.personRowSelected : ""}`}
          onClick={() => onToggle(person.id)}
          disabled={Boolean(locked)}
          aria-pressed={selected}
        >
          <PersonAvatar user={person} size={36} />
          <span className={styles.personText}>
            <span className={styles.personName}>
              {person.nickname || person.username}
            </span>
            <span className={styles.personHandle}>@{person.username}</span>
          </span>
          {locked ? (
            <span className={styles.personLocked}>{locked}</span>
          ) : (
            <span className={styles.personCheck} aria-hidden>
              {selected ? <Check size={14} strokeWidth={3} /> : null}
            </span>
          )}
        </button>
      </li>
    );
  };

  return (
    <div className={styles.picker}>
      <label className={styles.pickerSearch}>
        <Search size={16} aria-hidden />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("search")}
          aria-label={t("search")}
        />
      </label>

      {selectedIds.size > 0 ? (
        <p className={styles.pickerSelected}>
          {t("selected", { count: selectedIds.size })}
        </p>
      ) : null}

      <div className={styles.pickerList}>
        {isLoading ? <p className={styles.muted}>…</p> : null}
        {partners.length > 0 ? (
          <>
            <p className={styles.pickerGroup}>{t("fromChats")}</p>
            <ul>{partners.map(renderPerson)}</ul>
          </>
        ) : null}
        {others.length > 0 ? (
          <>
            <p className={styles.pickerGroup}>{t("everyone")}</p>
            <ul>{others.map(renderPerson)}</ul>
          </>
        ) : null}
        {!isLoading && partners.length + others.length === 0 ? (
          <p className={styles.muted}>{t("noResults")}</p>
        ) : null}
      </div>
    </div>
  );
}
