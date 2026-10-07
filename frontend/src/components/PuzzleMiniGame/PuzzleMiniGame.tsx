"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Dices, Frame, Lightbulb, LogOut, Magnet, Maximize2, Search, Volume2, VolumeX } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { bibleHref } from "@/components/GuessCharacterMiniGame/guessBible";
import PuzzleBoard, { type PuzzleBoardHandle } from "./PuzzleBoard";
import { suggestCharacters } from "./puzzleSearch";
import { formatDuration, placedCount } from "./puzzleView";
import type { PieceCount, PuzzleLang, PuzzleMode, PuzzleSocket } from "./puzzleTypes";
import { usePuzzleSession } from "./usePuzzleSession";
import styles from "./PuzzleMiniGame.module.scss";

type Props = {
  open: boolean;
  roomId: string | null;
  socket: PuzzleSocket | null;
  userId: string;
  peerName: string;
  myName?: string;
  myAvatarUrl?: string | null;
  peerAvatarUrl?: string | null;
  onClose: () => void;
};

const COUNTS: PieceCount[] = [12, 24, 48, 96];
const modeKey = (roomId: string) => `christapp:puzzle:mode:${roomId}`;
const SOUND_KEY = "christapp:puzzle:sound";

function readMode(roomId: string): PuzzleMode {
  try {
    return window.localStorage.getItem(modeKey(roomId)) === "solo" ? "solo" : "duel";
  } catch {
    return "duel";
  }
}

function writeMode(roomId: string, mode: PuzzleMode) {
  try {
    window.localStorage.setItem(modeKey(roomId), mode);
  } catch {
    // приватний режим — режим просто не запам'ятається
  }
}

function readSound(): boolean {
  try {
    return window.localStorage.getItem(SOUND_KEY) !== "off";
  } catch {
    return true;
  }
}

const initialOf = (name: string | undefined) => (name?.trim()[0] ?? "").toUpperCase();

export default function PuzzleMiniGame({
  open,
  roomId,
  socket,
  userId,
  peerName,
  myName,
  myAvatarUrl,
  peerAvatarUrl,
  onClose,
}: Props) {
  const t = useTranslations("puzzle");
  const locale = useLocale();
  const lang: PuzzleLang = locale === "ru" || locale === "en" ? locale : "ua";

  // Режим, у якому гравець був востаннє, — щоб після повернення в чат одразу відкрилась його гра.
  const storedMode = useMemo<PuzzleMode>(() => (open && roomId ? readMode(roomId) : "duel"), [open, roomId]);
  const [modeChoice, setModeChoice] = useState<{ roomId: string; mode: PuzzleMode } | null>(null);
  const mode = modeChoice && modeChoice.roomId === roomId ? modeChoice.mode : storedMode;
  const { session, catalog, select, setCount, start, again, toLobby, gather, grab, move, drop, cursor } =
    usePuzzleSession({ socket, roomId, open, mode });

  const boardRef = useRef<PuzzleBoardHandle>(null);
  const [showHint, setShowHint] = useState(false);
  const [edgesOnly, setEdgesOnly] = useState(false);
  const [soundOn, setSoundOn] = useState(readSound);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [summaryHidden, setSummaryHidden] = useState(false);
  const [query, setQuery] = useState("");
  const [pickTab, setPickTab] = useState<"random" | "byName">("random");
  const [clock, setClock] = useState(0);

  const toggleSound = useCallback(() => {
    setSoundOn((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(SOUND_KEY, next ? "on" : "off");
      } catch {
        // не критично
      }
      return next;
    });
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const phase = session?.phase ?? "lobby";
  const playing = phase === "playing";

  // Секундомір: тікає лише під час партії; відлік іде від часу сервера, щоб у обох був однаковий.
  const serverTime = session?.serverTime;
  const offsetRef = useRef(0);
  useEffect(() => {
    if (serverTime !== undefined) offsetRef.current = serverTime - Date.now();
  }, [serverTime]);
  useEffect(() => {
    if (!open || !playing) return;
    const tick = () => setClock(Date.now() + offsetRef.current);
    const first = window.setTimeout(tick, 0);
    const id = window.setInterval(tick, 1000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(id);
    };
  }, [open, playing]);

  // Підсумок і підтвердження виходу прив'язані до партії: нова партія скидає їх самі.
  const matchKey = session?.puzzle ? `${session.puzzle.seed}:${session.puzzle.startedAt}` : "none";
  const [trackedMatch, setTrackedMatch] = useState(matchKey);
  if (trackedMatch !== matchKey) {
    setTrackedMatch(matchKey);
    setConfirmLeave(false);
    setSummaryHidden(false);
    setShowHint(false);
    setEdgesOnly(false);
  }

  const changeMode = useCallback(
    (next: PuzzleMode) => {
      if (!roomId) return;
      writeMode(roomId, next);
      setModeChoice({ roomId, mode: next });
    },
    [roomId],
  );

  const imagesById = useMemo(() => new Map((catalog?.images ?? []).map((i) => [i.id, i])), [catalog]);
  const charactersById = useMemo(() => new Map((catalog?.characters ?? []).map((c) => [c.id, c])), [catalog]);
  const suggestions = useMemo(
    () => suggestCharacters(catalog?.characters ?? [], query, lang),
    [catalog, query, lang],
  );

  if (!open) return null;

  const solo = mode === "solo";
  const peerId = session?.players.find((id) => id !== userId) ?? null;
  const peerPresent = peerId ? session?.present[peerId] !== false : true;
  const creatorAbsent = session ? !session.present[session.creatorId] : false;
  const canPick = !session || solo || session.creatorId === userId || creatorAbsent;
  const chooserName = session?.creatorId === userId ? t("me") : peerName;
  const selection = session?.selection ?? null;
  const selectedImage = selection ? imagesById.get(selection.imageId) : undefined;
  const selectedCharacter = selection ? charactersById.get(selection.characterId) : undefined;
  const puzzle = session?.puzzle ?? null;
  const puzzleImage = puzzle ? imagesById.get(puzzle.imageId) : undefined;
  const total = puzzle ? puzzle.cols * puzzle.rows : 0;
  const placed = puzzle ? placedCount(puzzle.groups) : 0;
  const elapsed = puzzle ? Math.max(0, (puzzle.finishedAt ?? (clock || puzzle.startedAt)) - puzzle.startedAt) : 0;
  const reveal = session?.reveal ?? null;

  const imageCaption = (image: { title: string; author: string; year: number; dateLabel?: string }) =>
    t("imageCaption", { title: image.title, author: image.author, year: image.dateLabel ?? image.year });

  // ───────────── лобі ─────────────

  const renderLobby = () => {
    if (!session || !catalog) return null;
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
        </details>

        {!canPick ? <p className={styles.waiting}>{t("waitingPick", { name: chooserName })}</p> : null}

        {canPick ? (
          <>
            <p className={styles.lobbyTitle}>{t("chooseImage")}</p>
            <div className={styles.tabs} role="tablist" aria-label={t("chooseImage")}>
              {(["random", "byName"] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  role="tab"
                  aria-selected={pickTab === tab}
                  className={`${styles.tab} ${pickTab === tab ? styles.tabActive : ""}`}
                  onClick={() => setPickTab(tab)}
                >
                  {tab === "random" ? <Dices size={15} aria-hidden /> : <Search size={15} aria-hidden />}
                  {t(tab === "random" ? "tabRandom" : "tabByName")}
                </button>
              ))}
            </div>
            {pickTab === "random" ? (
              <button type="button" className={styles.secondaryButton} onClick={() => select("random")}>
                {selection?.mode === "random" ? t("randomAgain") : t("randomPick")}
              </button>
            ) : (
              <div className={styles.autocomplete}>
                <input
                  type="search"
                  className={styles.search}
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={t("searchPlaceholder")}
                  aria-label={t("searchPlaceholder")}
                  aria-autocomplete="list"
                  aria-controls="puzzle-suggestions"
                  autoComplete="off"
                  enterKeyHint="search"
                />
                {query.trim() ? (
                  <ul id="puzzle-suggestions" className={styles.suggestions} role="listbox">
                    {suggestions.map((c) => (
                      <li key={c.id} role="presentation">
                        <button
                          type="button"
                          role="option"
                          aria-selected={selection?.characterId === c.id}
                          className={styles.suggestion}
                          onClick={() => {
                            select("byName", c.id);
                            setQuery("");
                          }}
                        >
                          {c.name[lang]}
                          {c.imageIds.length > 1 ? (
                            <span className={styles.suggestionMeta}>{t("imagesCount", { count: c.imageIds.length })}</span>
                          ) : null}
                        </button>
                      </li>
                    ))}
                    {suggestions.length === 0 ? <li className={styles.muted}>{t("noResults")}</li> : null}
                  </ul>
                ) : null}
              </div>
            )}
          </>
        ) : null}

        {selectedImage && selectedCharacter ? (
          <figure className={styles.preview}>
            {/* eslint-disable-next-line @next/next/no-img-element -- прев'ю власного WebP: оптимізатор next/image тут зайвий */}
            <img src={selectedImage.url} alt={selectedCharacter.name[lang]} className={styles.previewImage} />
            <figcaption>
              <strong>{selectedCharacter.name[lang]}</strong>
              <span className={styles.muted}>{imageCaption(selectedImage)}</span>
              {canPick && selectedCharacter.imageIds.length > 1 ? (
                <button
                  type="button"
                  className={styles.linkButton}
                  onClick={() => select("byName", selectedCharacter.id)}
                >
                  {t("anotherImage")}
                </button>
              ) : null}
            </figcaption>
          </figure>
        ) : null}

        <p className={styles.lobbyTitle}>{t("piecesTitle")}</p>
        <div className={styles.countRow} role="radiogroup" aria-label={t("piecesTitle")}>
          {COUNTS.map((n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={session.count === n}
              disabled={!canPick}
              className={`${styles.countButton} ${session.count === n ? styles.countButtonActive : ""}`}
              onClick={() => setCount(n)}
            >
              {n}
            </button>
          ))}
        </div>

        {canPick ? (
          <div className={styles.actions}>
            <button type="button" className={styles.primaryButton} disabled={!selection} onClick={start}>
              {t("start")}
            </button>
          </div>
        ) : null}
      </div>
    );
  };

  // ───────────── гра й фінал ─────────────

  const renderStage = () => {
    if (!session || !puzzle || !puzzleImage || !roomId) return null;
    const isDone = phase === "done";
    return (
      <div className={styles.stage} role="dialog" aria-modal="true" aria-label={t("title")}>
        <div className={styles.stageBar}>
          <div className={styles.stageInfo}>
            <span className={styles.progress}>{t("progress", { placed, total })}</span>
            <span className={styles.timer} aria-label={t("timeLabel")}>
              {formatDuration(elapsed)}
            </span>
            {!solo && peerId ? (
              <span className={`${styles.peer} ${peerPresent ? styles.peerOnline : ""}`}>
                <i aria-hidden /> {peerName}
              </span>
            ) : null}
          </div>
          <button type="button" className={styles.close} onClick={onClose} aria-label={t("close")}>
            ×
          </button>
        </div>

        <PuzzleBoard
          ref={boardRef}
          socket={socket}
          roomId={roomId}
          puzzle={puzzle}
          image={puzzleImage}
          done={isDone}
          showHint={showHint}
          edgesOnly={edgesOnly}
          soundOn={soundOn}
          solo={solo}
          userId={userId}
          peerId={peerId}
          meInitial={initialOf(myName)}
          peerInitial={initialOf(peerName)}
          meAvatarUrl={myAvatarUrl}
          peerAvatarUrl={peerAvatarUrl}
          loadingLabel={t("loadingImage")}
          onGrab={grab}
          onMove={move}
          onDrop={drop}
          onCursor={cursor}
        />

        {!isDone && !solo && !peerPresent ? <p className={styles.notice}>{t("peerAway", { name: peerName })}</p> : null}

        {!isDone ? (
          <div className={styles.toolbar} role="toolbar" aria-label={t("toolbar")}>
            <button
              type="button"
              className={`${styles.tool} ${showHint ? styles.toolActive : ""}`}
              aria-pressed={showHint}
              onClick={() => setShowHint((v) => !v)}
            >
              <Lightbulb size={18} aria-hidden />
              <span>{showHint ? t("hideHint") : t("showHint")}</span>
            </button>
            <button
              type="button"
              className={`${styles.tool} ${edgesOnly ? styles.toolActive : ""}`}
              aria-pressed={edgesOnly}
              onClick={() => setEdgesOnly((v) => !v)}
            >
              <Frame size={18} aria-hidden />
              <span>{t("edgesOnly")}</span>
            </button>
            <button type="button" className={styles.tool} onClick={gather}>
              <Magnet size={18} aria-hidden />
              <span>{t("gather")}</span>
            </button>
            <button type="button" className={styles.tool} onClick={() => boardRef.current?.resetCamera()}>
              <Maximize2 size={18} aria-hidden />
              <span>{t("fitView")}</span>
            </button>
            <button type="button" className={styles.tool} aria-pressed={!soundOn} onClick={toggleSound}>
              {soundOn ? <Volume2 size={18} aria-hidden /> : <VolumeX size={18} aria-hidden />}
              <span>{soundOn ? t("soundOn") : t("soundOff")}</span>
            </button>
            {confirmLeave ? (
              <span className={styles.confirmLeave}>
                <span>{t("leaveConfirm")}</span>
                <button type="button" className={styles.dangerButton} onClick={toLobby}>
                  {t("leaveYes")}
                </button>
                <button type="button" className={styles.secondaryButton} onClick={() => setConfirmLeave(false)}>
                  {t("back")}
                </button>
              </span>
            ) : (
              <button type="button" className={styles.tool} onClick={() => setConfirmLeave(true)}>
                <LogOut size={18} aria-hidden />
                <span>{t("leave")}</span>
              </button>
            )}
          </div>
        ) : null}

        {isDone && reveal ? (
          summaryHidden ? (
            <div className={styles.summaryToggle}>
              <button type="button" className={styles.secondaryButton} onClick={() => setSummaryHidden(false)}>
                {t("showSummary")}
              </button>
            </div>
          ) : (
            <div className={styles.summary} aria-live="polite">
              <h3 className={styles.doneTitle}>{t("doneTitle")}</h3>
              <div className={styles.stats}>
                <span>{t("timeResult", { time: formatDuration(reveal.elapsedMs) })}</span>
                {session.players.map((id) => (
                  <span key={id}>
                    {t("placedBy", { name: id === userId ? t("me") : peerName, count: reveal.placedBy[id] ?? 0 })}
                  </span>
                ))}
              </div>
              {reveal.card ? (
                <div className={styles.card}>
                  <strong>{reveal.card.name[lang]}</strong>
                  <p>{reveal.card.about[lang]}</p>
                  <div className={styles.refs}>
                    {reveal.card.refs.map((ref) => (
                      <Link key={`${ref.book}:${ref.chapter}:${ref.verses}`} href={bibleHref(ref)} className={styles.ref}>
                        {ref.label[lang]}
                      </Link>
                    ))}
                  </div>
                </div>
              ) : null}
              <p className={styles.credit}>
                {t(reveal.image.source === "Wikimedia Commons" ? "creditLine" : "creditLineSource", {
                  author: reveal.image.author,
                  title: reveal.image.title,
                  year: reveal.image.dateLabel ?? reveal.image.year,
                  source: reveal.image.source,
                  license: reveal.image.license,
                })}{" "}
                <a href={reveal.image.sourceUrl} target="_blank" rel="noopener noreferrer">
                  {t("creditLink")}
                </a>
              </p>
              <div className={styles.actions}>
                <button type="button" className={styles.primaryButton} onClick={again}>
                  {t("again")}
                </button>
                <button type="button" className={styles.secondaryButton} onClick={toLobby}>
                  {t("other")}
                </button>
                <button type="button" className={styles.linkButton} onClick={() => setSummaryHidden(true)}>
                  {t("viewPicture")}
                </button>
              </div>
            </div>
          )
        ) : null}
      </div>
    );
  };

  const showStage = session && catalog && (phase === "playing" || phase === "done");
  if (showStage) return renderStage();

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div
        className={styles.modal}
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
        {!session || !catalog ? <p className={styles.waiting}>{t("connecting")}</p> : renderLobby()}
      </div>
    </div>
  );
}
