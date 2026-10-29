"use client";

import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { useTranslations } from "next-intl";
import { Camera, ImagePlus, Images, Trash2, X } from "lucide-react";
import type { PieceCount } from "./puzzleTypes";
import {
  PuzzleImageError,
  deletePuzzleImage,
  encodeSquareWebp,
  fetchMyPuzzleImages,
  setPuzzleImageShowAuthor,
  uploadPuzzleImage,
  type MyPuzzleImage,
} from "@/lib/puzzleImages";
import styles from "./PuzzleCustomImage.module.scss";

const VIEW = 280;
const MAX_ZOOM = 3;
const MAX_MINE = 5; // ліміт на сервері: старіші видаляються автоматично
const MAX_FILE_BYTES = 20 * 1024 * 1024;

type Props = {
  mode: "upload" | "mine";
  onClose: () => void;
  /** Картинка завантажена: гра може одразу запропонувати випадковий вибір. */
  onUploaded: () => void;
  /** Можно ли прямо сейчас запустить партию (есть связь, лобби, право выбирать). */
  canPlay: boolean;
  /** Начать партию этой картинкой с count кусочков. */
  onPlay: (imageId: string, count: PieceCount) => void;
};

const PIECE_COUNTS: PieceCount[] = [12, 24, 48, 96];

type Loaded = { img: HTMLImageElement; url: string };

function errorKey(err: unknown): string {
  const code = err instanceof PuzzleImageError ? err.code : "generic";
  return ["unsupported_type", "too_large", "rate_limited", "upload_blocked", "storage_unavailable", "upload_failed", "no_file"].includes(code)
    ? code
    : "generic";
}

/** Вікно «Своя картинка» (вибір фото, квадратна обрізка, прев'ю) і «Мої картинки» (список, видалення, ім'я автора). */
export default function PuzzleCustomImage({ mode, onClose, onUploaded, canPlay, onPlay }: Props) {
  const t = useTranslations("puzzle.custom");
  const [view, setView] = useState<"upload" | "mine">(mode);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [showAuthor, setShowAuthor] = useState(true);
  const [playNow, setPlayNow] = useState(true);
  const [pieces, setPieces] = useState<PieceCount>(24);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mine, setMine] = useState<MyPuzzleImage[] | null>(null);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ dist: number; zoom: number } | null>(null);

  useEffect(() => {
    // Escape закрывает только это окно, а не всю игру под ним
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopImmediatePropagation();
      onClose();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  useEffect(
    () => () => {
      if (loaded) URL.revokeObjectURL(loaded.url);
    },
    [loaded],
  );

  const loadMine = useCallback(() => {
    fetchMyPuzzleImages()
      .then(setMine)
      .catch(() => {
        setMine([]);
        setError("generic");
      });
  }, []);
  useEffect(() => {
    // кількість «N з 5» потрібна й у вкладці додавання — вантажимо при відкритті
    loadMine();
  }, [view, loadMine]);

  // базовий масштаб: зображення покриває квадрат; zoom додає до нього
  const base = loaded ? Math.max(VIEW / loaded.img.naturalWidth, VIEW / loaded.img.naturalHeight) : 1;
  const scale = base * zoom;
  const clamp = useCallback(
    (x: number, y: number, z: number) => {
      if (!loaded) return { x: 0, y: 0 };
      const s = base * z;
      const maxX = Math.max(0, (loaded.img.naturalWidth * s - VIEW) / 2);
      const maxY = Math.max(0, (loaded.img.naturalHeight * s - VIEW) / 2);
      return { x: Math.min(maxX, Math.max(-maxX, x)), y: Math.min(maxY, Math.max(-maxY, y)) };
    },
    [loaded, base],
  );

  const atLimit = mine !== null && mine.length >= MAX_MINE;

  const onFile = (file: File | undefined) => {
    setError(null);
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) return setError("tooBigFile");
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      setLoaded({ img, url });
      setZoom(1);
      setOffset({ x: 0, y: 0 });
    };
    // формат, який браузер не вміє читати (наприклад HEIC не в Safari), - просимо вибрати JPEG/PNG
    img.onerror = () => {
      URL.revokeObjectURL(url);
      setError("cannotRead");
    };
    img.src = url;
  };

  const pointerDistance = () => {
    const [a, b] = [...pointers.current.values()];
    return Math.hypot(a.x - b.x, a.y - b.y) || 1;
  };
  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size >= 2) {
      // два пальці: щіпок змінює масштаб (додатково до повзунка)
      drag.current = null;
      pinch.current = { dist: pointerDistance(), zoom };
      return;
    }
    drag.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch.current && pointers.current.size >= 2) {
      const z = Math.min(MAX_ZOOM, Math.max(1, (pinch.current.zoom * pointerDistance()) / pinch.current.dist));
      setZoom(z);
      setOffset((o) => clamp(o.x, o.y, z));
      return;
    }
    const d = drag.current;
    if (!d) return;
    setOffset(clamp(d.ox + e.clientX - d.x, d.oy + e.clientY - d.y, zoom));
  };
  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    const rest = [...pointers.current.values()][0];
    // лишився один палець — продовжуємо перетягування від його позиції
    drag.current = rest ? { x: rest.x, y: rest.y, ox: offset.x, oy: offset.y } : null;
  };

  const submit = async () => {
    if (!loaded || busy) return;
    setBusy(true);
    setError(null);
    try {
      const { img } = loaded;
      // вирізана область у пікселях джерела: центр + зсув, сторона = VIEW / scale
      const side = VIEW / scale;
      const sx = img.naturalWidth / 2 - offset.x / scale - side / 2;
      const sy = img.naturalHeight / 2 - offset.y / scale - side / 2;
      const blob = await encodeSquareWebp(img, Math.max(0, sx), Math.max(0, sy), Math.min(side, img.naturalWidth, img.naturalHeight));
      const created = await uploadPuzzleImage(blob, showAuthor);
      setLoaded(null);
      onUploaded();
      if (playNow && canPlay) {
        // партия стартует сразу этой картинкой; окно закрываем, чтобы показать игру
        onPlay(created.id, pieces);
        onClose();
        return;
      }
      setView("mine");
    } catch (err) {
      setError(errorKey(err));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    setPendingDelete(null);
    try {
      await deletePuzzleImage(id);
      setMine((prev) => prev?.filter((i) => i.id !== id) ?? null);
    } catch {
      setError("generic");
    }
  };

  const toggleAuthor = async (img: MyPuzzleImage) => {
    try {
      const updated = await setPuzzleImageShowAuthor(img.id, !img.showAuthor);
      setMine((prev) => prev?.map((i) => (i.id === img.id ? updated : i)) ?? null);
    } catch {
      setError("generic");
    }
  };

  const pieceRow = (
    <div className={styles.pieces} role="radiogroup" aria-label={t("pieces")}>
      <span className={styles.hint}>{t("pieces")}</span>
      {PIECE_COUNTS.map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={pieces === n}
          className={`${styles.pieceBtn} ${pieces === n ? styles.pieceBtnActive : ""}`}
          onClick={() => setPieces(n)}
        >
          {n}
        </button>
      ))}
    </div>
  );

  return (
    <div className={styles.backdrop} onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={styles.dialog} role="dialog" aria-modal="true" aria-label={t(view === "upload" ? "title" : "mineTitle")}>
        <div className={styles.head}>
          <h3>{t(view === "upload" ? "title" : "mineTitle")}</h3>
          <button type="button" className={styles.close} onClick={onClose} aria-label={t("close")}>
            <X size={18} aria-hidden />
          </button>
        </div>
        <div className={styles.tabs} role="tablist">
          {(["upload", "mine"] as const).map((v) => (
            <button key={v} type="button" role="tab" aria-selected={view === v} className={`${styles.tab} ${view === v ? styles.tabActive : ""}`} onClick={() => setView(v)}>
              {t(v === "upload" ? "tabUpload" : "tabMine")}
            </button>
          ))}
        </div>

        {error ? (
          <p className={styles.error} role="alert">
            {t(`errors.${error}`)}
          </p>
        ) : null}

        {view === "upload" ? (
          <div className={styles.body}>
            {loaded ? (
              <>
                <div
                  className={styles.crop}
                  style={{ width: VIEW, height: VIEW }}
                  onPointerDown={onPointerDown}
                  onPointerMove={onPointerMove}
                  onPointerUp={onPointerUp}
                  onPointerCancel={onPointerUp}
                  role="img"
                  aria-label={t("cropAria")}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- локальне прев'ю blob-URL */}
                  <img
                    src={loaded.url}
                    alt=""
                    draggable={false}
                    style={{
                      width: loaded.img.naturalWidth * scale,
                      height: loaded.img.naturalHeight * scale,
                      transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px))`,
                    }}
                  />
                </div>
                <label className={styles.zoom}>
                  {t("zoom")}
                  <input
                    type="range"
                    min={1}
                    max={MAX_ZOOM}
                    step={0.01}
                    value={zoom}
                    onChange={(e) => {
                      const z = Number(e.target.value);
                      setZoom(z);
                      setOffset((o) => clamp(o.x, o.y, z));
                    }}
                  />
                </label>
                <p className={styles.hint}>{t("cropHint")}</p>
              </>
            ) : (
              <p className={styles.hint}>{t("pickHint")}</p>
            )}
            <div className={styles.pickRow}>
              <label className={styles.btn}>
                <ImagePlus size={16} aria-hidden /> {t("gallery")}
                <input type="file" accept="image/*" hidden onChange={(e) => {
                    onFile(e.target.files?.[0]);
                    e.target.value = "";
                  }} />
              </label>
              <label className={styles.btn}>
                <Camera size={16} aria-hidden /> {t("camera")}
                <input type="file" accept="image/*" capture="environment" hidden onChange={(e) => {
                    onFile(e.target.files?.[0]);
                    e.target.value = "";
                  }} />
              </label>
            </div>
            <label className={styles.check}>
              <input type="checkbox" checked={showAuthor} onChange={(e) => setShowAuthor(e.target.checked)} />
              {t("showAuthor")}
            </label>
            <label className={styles.check}>
              <input type="checkbox" checked={playNow} onChange={(e) => setPlayNow(e.target.checked)} />
              {t("playNow")}
            </label>
            {playNow ? pieceRow : null}
            {playNow && !canPlay ? <p className={styles.hint}>{t("playUnavailable")}</p> : null}
            <p className={styles.hint}>{t("publicNote")}</p>
            {mine !== null ? (
              <p className={styles.hint}>{t("count", { count: mine.length, max: MAX_MINE })}</p>
            ) : null}
            {atLimit ? <p className={styles.hint}>{t("limitReached")}</p> : null}
            <button type="button" className={styles.primary} disabled={!loaded || busy || atLimit} onClick={() => void submit()}>
              {busy ? t("uploading") : t("upload")}
            </button>
          </div>
        ) : (
          <div className={styles.body}>
            {mine === null ? <p className={styles.hint}>{t("loading")}</p> : null}
            {mine && mine.length > 0 ? pieceRow : null}
            {mine?.length === 0 ? (
              <div className={styles.empty}>
                <Images size={30} aria-hidden />
                <p>{t("empty")}</p>
              </div>
            ) : null}
            {mine && mine.length > 0 ? <p className={styles.hint}>{t("count", { count: mine.length, max: MAX_MINE })}</p> : null}
            <ul className={styles.list}>
              {mine?.map((img) => (
                <li key={img.id} className={styles.item}>
                  {/* eslint-disable-next-line @next/next/no-img-element -- мініатюра власної картинки */}
                  <img src={img.url} alt="" width={56} height={56} loading="lazy" />
                  <div className={styles.itemMain}>
                    <span className={styles.hint}>{new Date(img.createdAt).toLocaleDateString()}</span>
                    <label className={styles.check}>
                      <input type="checkbox" checked={img.showAuthor} onChange={() => void toggleAuthor(img)} />
                      {t("showAuthor")}
                    </label>
                  </div>
                  <button
                    type="button"
                    className={styles.assemble}
                    disabled={!canPlay}
                    title={canPlay ? undefined : t("playUnavailable")}
                    onClick={() => {
                      onPlay(img.id, pieces);
                      onClose();
                    }}
                  >
                    {t("assemble")}
                  </button>
                  {pendingDelete === img.id ? (
                    <span className={styles.confirm} role="group" aria-label={t("deleteConfirm")}>
                      <button type="button" className={styles.danger} onClick={() => void remove(img.id)}>
                        {t("deleteYes")}
                      </button>
                      <button type="button" className={styles.danger} onClick={() => setPendingDelete(null)}>
                        {t("cancel")}
                      </button>
                    </span>
                  ) : (
                    <button type="button" className={styles.danger} onClick={() => setPendingDelete(img.id)} aria-label={t("delete")} title={t("delete")}>
                      <Trash2 size={16} aria-hidden />
                    </button>
                  )}
                </li>
              ))}
            </ul>
            <p className={styles.hint}>{t("limitNote")}</p>
          </div>
        )}
      </div>
    </div>
  );
}
