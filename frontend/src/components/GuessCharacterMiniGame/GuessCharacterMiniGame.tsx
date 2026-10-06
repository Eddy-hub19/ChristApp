"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { bibleHref } from "./guessBible";
import { filterCharacters } from "./guessSearch";
import {
  EMPTY_STATS,
  applyMatches,
  loadStats,
  saveStats,
  type GuessStatsState,
} from "./guessStats";
import type {
  CatalogCharacter,
  GuessLang,
  GuessLevel,
  GuessMode,
  GuessSocket,
  HistoryEntry,
  TraitAnswer,
} from "./guessTypes";
import { useGuessSession } from "./useGuessSession";
import styles from "./GuessCharacterMiniGame.module.scss";

type Props = {
  open: boolean;
  roomId: string | null;
  socket: GuessSocket | null;
  userId: string;
  peerName: string;
  onClose: () => void;
};

const LEVELS: GuessLevel[] = [1, 2, 3];
const ANSWER_GLYPH: Record<TraitAnswer, string> = { yes: "✓", no: "✕", unknown: "?" };
const modeKey = (roomId: string) => `christapp:guess:mode:${roomId}`;

function readMode(roomId: string): GuessMode {
  try {
    return window.localStorage.getItem(modeKey(roomId)) === "solo" ? "solo" : "duel";
  } catch {
    return "duel";
  }
}

function writeMode(roomId: string, mode: GuessMode) {
  try {
    window.localStorage.setItem(modeKey(roomId), mode);
  } catch {
    // приватний режим — режим просто не запам'ятається
  }
}

type PickerProps = {
  characters: CatalogCharacter[];
  lang: GuessLang;
  excludeIds?: string[];
  confirmLabel: (name: string) => string;
  onConfirm: (id: string) => void;
  onCancel?: () => void;
};

/** Список персонажів із пошуком: тап вибирає, окрема кнопка підтверджує — випадково не загадаєш і не вгадаєш. */
function CharacterPicker({ characters, lang, excludeIds = [], confirmLabel, onConfirm, onCancel }: PickerProps) {
  const t = useTranslations("guessCharacter");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const list = useMemo(
    () => filterCharacters(characters, query, lang).filter((c) => !excludeIds.includes(c.id)),
    [characters, query, lang, excludeIds],
  );
  const chosen = characters.find((c) => c.id === selected);

  return (
    <div className={styles.picker}>
      <input
        type="search"
        className={styles.search}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={t("searchPlaceholder")}
        aria-label={t("searchPlaceholder")}
        autoComplete="off"
        enterKeyHint="search"
      />
      <ul className={styles.pickList} role="listbox" aria-label={t("searchPlaceholder")}>
        {list.map((c) => (
          <li key={c.id} role="presentation">
            <button
              type="button"
              role="option"
              aria-selected={selected === c.id}
              className={`${styles.pickItem} ${selected === c.id ? styles.pickItemActive : ""}`}
              onClick={() => setSelected(c.id)}
            >
              {c.name[lang]}
            </button>
          </li>
        ))}
        {list.length === 0 ? <li className={styles.muted}>{t("noResults")}</li> : null}
      </ul>
      <div className={styles.pickActions}>
        {onCancel ? (
          <button type="button" className={styles.secondaryButton} onClick={onCancel}>
            {t("back")}
          </button>
        ) : null}
        <button
          type="button"
          className={styles.primaryButton}
          disabled={!chosen}
          onClick={() => chosen && onConfirm(chosen.id)}
        >
          {chosen ? confirmLabel(chosen.name[lang]) : t("searchPlaceholder")}
        </button>
      </div>
    </div>
  );
}

export default function GuessCharacterMiniGame({ open, roomId, socket, userId, peerName, onClose }: Props) {
  const t = useTranslations("guessCharacter");
  const locale = useLocale();
  const lang: GuessLang = locale === "ru" || locale === "en" ? locale : "ua";

  // Режим, у якому гравець був востаннє, — щоб після повернення в чат одразу відкрилась його гра.
  const storedMode = useMemo<GuessMode>(
    () => (open && roomId ? readMode(roomId) : "duel"),
    [open, roomId],
  );
  const [modeChoice, setModeChoice] = useState<{ roomId: string; mode: GuessMode } | null>(null);
  const mode = modeChoice && modeChoice.roomId === roomId ? modeChoice.mode : storedMode;
  const { session, catalog, selectLevel, setReady, pick, ask, guess, next, abort } = useGuessSession({
    socket,
    roomId,
    open,
    mode,
  });

  const [tab, setTab] = useState<string>("who");
  const [hintOpen, setHintOpen] = useState(false);
  // Панель здогадки й підтвердження виходу прив'язані до кроку гри: коли крок змінюється, вони самі «закриваються».
  const stepKey = `${session?.phase}:${session?.round}`;
  const [guessingAt, setGuessingAt] = useState<string | null>(null);
  const [confirmAbortAt, setConfirmAbortAt] = useState<string | null>(null);
  const guessing = guessingAt === stepKey;
  const confirmAbort = confirmAbortAt === stepKey;
  const setGuessing = (value: boolean) => setGuessingAt(value ? stepKey : null);
  const setConfirmAbort = (value: boolean) => setConfirmAbortAt(value ? stepKey : null);

  const peerId = useMemo(
    () => session?.players.find((id) => id !== userId) ?? null,
    [session, userId],
  );

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Статистика з журналу матчів сервера: матч, що закінчився поки гравця не було в грі, теж зарахується — один раз.
  const matches = session?.matches;
  const duelPeerId = open && session?.mode === "duel" ? peerId : null;
  const stats = useMemo<GuessStatsState>(
    () =>
      duelPeerId
        ? applyMatches(loadStats(userId, duelPeerId), matches ?? [], userId)
        : EMPTY_STATS,
    [matches, duelPeerId, userId],
  );
  useEffect(() => {
    if (duelPeerId) saveStats(userId, duelPeerId, stats);
  }, [stats, duelPeerId, userId]);

  const changeMode = useCallback(
    (next: GuessMode) => {
      if (!roomId) return;
      writeMode(roomId, next);
      setModeChoice({ roomId, mode: next });
    },
    [roomId],
  );

  const characters = useMemo(() => catalog?.characters ?? [], [catalog]);
  const byId = useMemo(() => new Map(characters.map((c) => [c.id, c])), [characters]);
  const nameOf = useCallback((id: string) => byId.get(id)?.name[lang] ?? id, [byId, lang]);
  const pool = useMemo(
    () => characters.filter((c) => c.difficulty <= (session?.level ?? 1)),
    [characters, session?.level],
  );
  const traitsByGroup = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const trait of catalog?.traits ?? []) {
      map.set(trait.group, [...(map.get(trait.group) ?? []), trait.id]);
    }
    return map;
  }, [catalog]);

  if (!open) return null;

  const solo = mode === "solo";
  const isGuesser = session?.guesserId === userId;
  const isHider = session?.hiderId === userId;
  const hiderName = session?.hiderId === userId ? t("me") : peerName;
  const guesserName = session?.guesserId === userId ? t("me") : peerName;
  const peerPresent = peerId ? session?.present[peerId] !== false : true;
  const maxAttempts = session?.maxQuestions ?? 10;
  const used = session?.history.length ?? 0;
  const myScore = session?.scores[userId] ?? 0;
  const peerScore = peerId ? (session?.scores[peerId] ?? 0) : 0;
  const askedTraits = new Set(
    (session?.history ?? []).flatMap((h) => (h.kind === "question" ? [h.trait] : [])),
  );
  const guessedIds = (session?.history ?? []).flatMap((h) => (h.kind === "guess" ? [h.character] : []));

  const answerLabel = (answer: TraitAnswer) =>
    answer === "yes" ? t("answerYes") : answer === "no" ? t("answerNo") : t("answerUnknown");

  const renderHistory = (history: HistoryEntry[]) => (
    <section className={styles.section} aria-label={t("historyTitle")}>
      <h3 className={styles.sectionTitle}>{t("historyTitle")}</h3>
      {history.length === 0 ? (
        <p className={styles.muted}>{t("historyEmpty")}</p>
      ) : (
        <ol className={styles.history} aria-live="polite">
          {[...history].reverse().map((entry, i) => {
            const n = history.length - i;
            return entry.kind === "question" ? (
              <li key={n} className={styles.historyItem}>
                <span className={styles.historyText}>
                  <span className={styles.historyNum}>{n}.</span> {t(`traits.${entry.trait}`)}
                </span>
                <span className={`${styles.answer} ${styles[`answer_${entry.answer}`]}`}>
                  <span aria-hidden>{ANSWER_GLYPH[entry.answer]}</span> {answerLabel(entry.answer)}
                </span>
              </li>
            ) : (
              <li key={n} className={styles.historyItem}>
                <span className={styles.historyText}>
                  <span className={styles.historyNum}>{n}.</span> {t("guessEntry", { name: nameOf(entry.character) })}
                </span>
                <span className={`${styles.answer} ${styles.answer_no}`}>
                  <span aria-hidden>✕</span> {t("guessWrong")}
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );

  const header = (
    <>
      {session && session.phase !== "lobby" ? (
        <div className={styles.statusRow}>
          <span>{t("round", { n: session.round, total: session.rounds })}</span>
          <span>
            {solo
              ? t("soloTotal", { points: myScore })
              : t("scoreLine", { me: t("me"), mine: myScore, name: peerName, theirs: peerScore })}
          </span>
        </div>
      ) : null}
      {!solo && session && session.phase !== "lobby" && !peerPresent ? (
        <p className={styles.notice}>{t("peerAway", { name: peerName })}</p>
      ) : null}
    </>
  );

  const renderLobby = () => {
    const level = session?.level ?? 1;
    const myReady = session ? Boolean(session.ready[userId]) : false;
    const peerReady = peerId && session ? Boolean(session.ready[peerId]) : false;
    return (
      <div className={styles.lobby}>
        <div className={styles.modeSwitch} role="radiogroup" aria-label={t("modeLabel")}>
          {(["duel", "solo"] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={mode === m}
              className={`${styles.modeButton} ${mode === m ? styles.modeButtonActive : ""}`}
              onClick={() => changeMode(m)}
            >
              {m === "duel" ? t("modeDuel", { name: peerName }) : t("modeSolo")}
            </button>
          ))}
        </div>
        <details className={styles.rules}>
          <summary>{t("rulesTitle")}</summary>
          <p>{t("rules")}</p>
          <p>{t("answersNote")}</p>
        </details>
        <p className={styles.lobbyTitle}>{t("chooseLevel")}</p>
        <div className={styles.levelList} role="radiogroup" aria-label={t("chooseLevel")}>
          {LEVELS.map((l) => (
            <button
              key={l}
              type="button"
              role="radio"
              aria-checked={level === l}
              className={`${styles.levelCard} ${level === l ? styles.levelCardActive : ""}`}
              onClick={() => selectLevel(l)}
            >
              <span className={styles.levelName}>{t(`level${l}Name`)}</span>
              <span className={styles.levelDesc}>{t(`level${l}Desc`)}</span>
            </button>
          ))}
        </div>
        {!solo && peerId ? (
          <>
            <p className={styles.muted} title={t("versusLegend")}>
              {t("versus", { name: peerName, wins: stats.record.wins, losses: stats.record.losses, draws: stats.record.draws })}
            </p>
            <div className={styles.readyRow}>
              <span className={myReady ? styles.readyOk : undefined}>
                {t("me")}: {myReady ? t("readyState") : t("notReady")}
              </span>
              <span className={peerReady ? styles.readyOk : undefined}>
                {peerName}: {peerReady ? t("readyState") : t("waitingState")}
              </span>
            </div>
          </>
        ) : null}
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.primaryButton}
            disabled={!session}
            onClick={() => setReady(solo ? true : !myReady)}
          >
            {solo ? t("start") : myReady ? t("cancelReady") : t("ready")}
          </button>
        </div>
      </div>
    );
  };

  const renderPicking = () => {
    if (!session) return null;
    if (!isHider) {
      return <p className={styles.waiting}>{t("waitingPick", { name: hiderName })}</p>;
    }
    return (
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>{t("pickTitle")}</h3>
        <p className={styles.muted}>{t("pickSubtitle")}</p>
        <CharacterPicker
          characters={pool}
          lang={lang}
          confirmLabel={(name) => t("confirmPick", { name })}
          onConfirm={pick}
        />
      </section>
    );
  };

  const renderAsking = () => {
    if (!session) return null;
    const left = maxAttempts - used;
    const attemptsBar = (
      <div className={styles.attempts}>
        <span>{t("attemptsLeft", { n: left, total: maxAttempts })}</span>
        <span className={styles.attemptsDots} aria-hidden>
          {Array.from({ length: maxAttempts }, (_, i) => (
            <i key={i} className={i < used ? styles.dotUsed : styles.dot} />
          ))}
        </span>
      </div>
    );

    if (!isGuesser) {
      return (
        <>
          {session.secretId ? <p className={styles.secretBanner}>{t("youHid", { name: nameOf(session.secretId) })}</p> : null}
          <p className={styles.waiting}>{t("waitingGuess", { name: guesserName })}</p>
          {attemptsBar}
          {renderHistory(session.history)}
        </>
      );
    }

    if (guessing) {
      return (
        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>{t("guessTitle")}</h3>
          <p className={styles.muted}>{t("attemptsNote")}</p>
          <CharacterPicker
            characters={pool}
            lang={lang}
            excludeIds={guessedIds}
            confirmLabel={(name) => t("guessConfirm", { name })}
            onConfirm={(id) => {
              setGuessing(false);
              guess(id);
            }}
            onCancel={() => setGuessing(false)}
          />
        </section>
      );
    }

    const groups = catalog?.groups ?? [];
    const activeTab = groups.includes(tab) ? tab : (groups[0] ?? "who");
    const candidates = session.candidates;
    return (
      <>
        <p className={styles.muted}>{t("yourTurn")}</p>
        {attemptsBar}
        <div className={styles.tabs} role="tablist" aria-label={t("questionsTitle")}>
          {groups.map((g) => (
            <button
              key={g}
              type="button"
              role="tab"
              aria-selected={activeTab === g}
              className={`${styles.tab} ${activeTab === g ? styles.tabActive : ""}`}
              onClick={() => setTab(g)}
            >
              {t(`groups.${g}`)}
            </button>
          ))}
        </div>
        <div className={styles.traitList} role="tabpanel">
          {(traitsByGroup.get(activeTab) ?? []).map((id) => {
            const done = askedTraits.has(id);
            const answered = session.history.find((h) => h.kind === "question" && h.trait === id);
            return (
              <button
                key={id}
                type="button"
                className={styles.traitButton}
                disabled={done}
                onClick={() => ask(id)}
              >
                <span>{t(`traits.${id}`)}</span>
                {answered && answered.kind === "question" ? (
                  <span className={`${styles.answer} ${styles[`answer_${answered.answer}`]}`}>
                    <span aria-hidden>{ANSWER_GLYPH[answered.answer]}</span> {answerLabel(answered.answer)}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
        <button type="button" className={styles.guessButton} onClick={() => setGuessing(true)}>
          {t("guessOpen")}
        </button>
        {candidates ? (
          <section className={styles.hint}>
            <button
              type="button"
              className={styles.hintToggle}
              aria-expanded={hintOpen}
              onClick={() => setHintOpen((v) => !v)}
            >
              {t("hintTitle", { n: candidates.length })} · {hintOpen ? t("hintHide") : t("hintShow")}
            </button>
            {hintOpen ? (
              <ul className={styles.chips}>
                {candidates.map((id) => (
                  <li key={id} className={styles.chip}>
                    {nameOf(id)}
                  </li>
                ))}
              </ul>
            ) : null}
          </section>
        ) : null}
        {renderHistory(session.history)}
      </>
    );
  };

  const renderReveal = () => {
    if (!session?.reveal) return null;
    const r = session.reveal;
    return (
      <section className={styles.card2} aria-live="polite">
        <p className={`${styles.resultLine} ${r.guessed ? styles.resultWon : styles.resultLost}`}>
          {r.guessed ? t("roundWon", { points: r.points }) : t("roundLost")}
        </p>
        <p className={styles.muted}>{t("roundDetails", { attempts: r.attempts, points: r.points })}</p>
        <p className={styles.hiddenWas}>{t("hiddenWas")}</p>
        <h3 className={styles.cardName}>{r.card.name[lang]}</h3>
        <p className={styles.cardAbout}>{r.card.about[lang]}</p>
        <p className={styles.hiddenWas}>{t("cardRefs")}</p>
        <ul className={styles.refs}>
          {r.card.refs.map((ref) => (
            <li key={`${ref.book}:${ref.chapter}:${ref.verses ?? ""}`}>
              <Link href={bibleHref(ref)} className={styles.refLink} onClick={onClose}>
                {ref.label[lang]}
              </Link>
            </li>
          ))}
        </ul>
      </section>
    );
  };

  const renderRoundEnd = () => (
    <>
      {renderReveal()}
      <div className={styles.actions}>
        <button type="button" className={styles.primaryButton} onClick={next}>
          {t("nextRound")}
        </button>
      </div>
      {session ? renderHistory(session.history) : null}
    </>
  );

  const renderMatchEnd = () => {
    if (!session) return null;
    const winner = session.matchWinner;
    const myReady = Boolean(session.ready[userId]);
    const title = solo
      ? t("soloTotal", { points: myScore })
      : winner === null
        ? t("draw")
        : winner === userId
          ? t("youWon")
          : t("youLost", { name: peerName });
    return (
      <>
        <h3 className={styles.matchTitle}>{t("matchOver")}</h3>
        <p className={styles.matchResult}>{title}</p>
        {!solo ? (
          <p className={styles.muted}>
            {t("finalScore", { me: t("me"), mine: myScore, name: peerName, theirs: peerScore })}
          </p>
        ) : null}
        <ol className={styles.rounds}>
          {session.results.map((r) => (
            <li key={r.round}>
              {t("roundRow", { n: r.round, character: nameOf(r.characterId), points: r.points })}
            </li>
          ))}
        </ol>
        {renderReveal()}
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.primaryButton}
            onClick={() => setReady(solo ? true : !myReady)}
          >
            {solo ? t("playAgain") : myReady ? t("cancelReady") : t("playAgain")}
          </button>
          <button type="button" className={styles.secondaryButton} onClick={abort}>
            {t("backToLobby")}
          </button>
        </div>
      </>
    );
  };

  const inMatch = session != null && session.phase !== "lobby" && session.phase !== "matchEnd";

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div
        className={styles.card}
        role="dialog"
        aria-modal="true"
        aria-label={t("title")}
        onClick={(event) => event.stopPropagation()}
      >
        <div className={styles.topRow}>
          <p className={styles.title}>{t("title")}</p>
          <button type="button" className={styles.close} onClick={onClose} aria-label={t("close")}>
            ×
          </button>
        </div>
        {!session || !catalog ? <p className={styles.waiting}>{t("connecting")}</p> : null}
        {session && catalog ? (
          <>
            {header}
            {session.phase === "lobby" ? renderLobby() : null}
            {session.phase === "picking" ? renderPicking() : null}
            {session.phase === "asking" ? renderAsking() : null}
            {session.phase === "roundEnd" ? renderRoundEnd() : null}
            {session.phase === "matchEnd" ? renderMatchEnd() : null}
            {inMatch ? (
              <div className={styles.abortRow}>
                {confirmAbort ? (
                  <>
                    <span className={styles.muted}>{t("abortConfirm")}</span>
                    <button type="button" className={styles.dangerButton} onClick={abort}>
                      {t("abortYes")}
                    </button>
                    <button type="button" className={styles.secondaryButton} onClick={() => setConfirmAbort(false)}>
                      {t("back")}
                    </button>
                  </>
                ) : (
                  <button type="button" className={styles.linkButton} onClick={() => setConfirmAbort(true)}>
                    {t("abort")}
                  </button>
                )}
              </div>
            ) : null}
          </>
        ) : null}
      </div>
    </div>
  );
}
