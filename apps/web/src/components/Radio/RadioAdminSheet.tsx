"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { Trash2, Upload } from "lucide-react";
import Sheet from "@/components/Cinema/Sheet";
import {
  RadioApiError,
  deleteRadioTrack,
  fetchRadioTracks,
  uploadRadioTrack,
  type RadioAdminTrack,
} from "@/lib/radioApi";
import { formatTime } from "@/components/SheepPlayer/SheepPlayerSheet";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { useRadio } from "@/providers/radioContext";
import styles from "./Radio.module.scss";

const MAX_AUDIO_BYTES = 25 * 1024 * 1024;

/** Длительность аудиофайла меряет браузер админа (сервер лишь проверяет диапазон 5 с .. 30 мин). */
function measureDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const audio = new Audio();
    const done = (fn: () => void) => {
      URL.revokeObjectURL(url);
      audio.removeAttribute("src");
      fn();
    };
    audio.preload = "metadata";
    audio.onloadedmetadata = () => done(() => (Number.isFinite(audio.duration) ? resolve(Math.round(audio.duration)) : reject(new Error("duration"))));
    audio.onerror = () => done(() => reject(new Error("decode")));
    audio.src = url;
  });
}

const stripExt = (name: string) => name.replace(/\.[^.]+$/, "").replace(/[_]+/g, " ").trim();

/** «Добавить трек»: загрузка доступна всем; очередь эфира с удалением треков видит только админ. */
export default function RadioAdminSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useTranslations("radio");
  const radio = useRadio();
  const isAdmin = useIsAdmin() === true;
  const currentId = radio.state?.track?.id ?? null;

  const [tracks, setTracks] = useState<RadioAdminTrack[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [artist, setArtist] = useState("");
  const [uploading, setUploading] = useState(false);
  const formRef = useRef<HTMLFormElement | null>(null);

  const load = useCallback(() => {
    if (!isAdmin) return;
    fetchRadioTracks()
      .then((rows) => {
        setTracks(rows);
        setLoadError(false);
      })
      .catch(() => setLoadError(true));
  }, [isAdmin]);

  // Открыли шторку или эфир переключился (текущий трек поменялся): перечитываем очередь.
  useEffect(() => {
    if (open) load();
  }, [open, load, currentId]);

  const run = async (id: string, job: () => Promise<unknown>) => {
    setBusyId(id);
    setMessage(null);
    try {
      await job();
      load();
    } catch (err) {
      setMessage({ kind: "error", text: err instanceof RadioApiError ? err.message : t("actionFailed") });
    } finally {
      setBusyId(null);
      setConfirmId(null);
    }
  };

  const onPickFile = (picked: File | null) => {
    setFile(picked);
    setMessage(null);
    if (picked && !title.trim()) setTitle(stripExt(picked.name).slice(0, 120));
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!file || uploading) return;
    setMessage(null);
    if (file.size > MAX_AUDIO_BYTES) {
      setMessage({ kind: "error", text: t("fileTooBig") });
      return;
    }
    setUploading(true);
    try {
      const durationSec = await measureDuration(file).catch(() => 0);
      if (durationSec < 5 || durationSec > 30 * 60) {
        setMessage({ kind: "error", text: t("badDuration") });
        return;
      }
      const form = new FormData();
      form.append("file", file);
      form.append("title", title.trim());
      form.append("artist", artist.trim());
      form.append("durationSec", String(durationSec));
      await uploadRadioTrack(form);
      setMessage({ kind: "ok", text: t("uploaded") });
      setFile(null);
      setTitle("");
      setArtist("");
      formRef.current?.reset();
      load();
      radio.refresh();
    } catch (err) {
      setMessage({ kind: "error", text: err instanceof RadioApiError ? err.message : t("uploadFailed") });
    } finally {
      setUploading(false);
    }
  };

  return (
    <Sheet open={open} onClose={onClose} title={t("manageTitle")} fullscreenOnMobile>
      <div className={styles.admin}>
        <p className={styles.rights}>{t("rightsNote")}</p>

        <form ref={formRef} className={styles.form} onSubmit={submit}>
          <h3 className={styles.sectionTitle}>{t("uploadTitle")}</h3>
          <label className={styles.field}>
            <span>{t("fileLabel")}</span>
            <input type="file" accept=".mp3,.m4a,.aac,.ogg,audio/mpeg,audio/mp4,audio/aac,audio/ogg" onChange={(e) => onPickFile(e.target.files?.[0] ?? null)} required />
          </label>
          <label className={styles.field}>
            <span>{t("titleLabel")}</span>
            <input type="text" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} required />
          </label>
          <label className={styles.field}>
            <span>{t("artistLabel")}</span>
            <input type="text" value={artist} maxLength={120} onChange={(e) => setArtist(e.target.value)} />
          </label>
          <button type="submit" className={styles.primaryBtn} disabled={!file || !title.trim() || uploading}>
            <Upload size={16} aria-hidden />
            {uploading ? t("uploading") : t("upload")}
          </button>
          {message ? (
            <p className={message.kind === "ok" ? styles.msgOk : styles.msgError} role={message.kind === "ok" ? "status" : "alert"}>
              {message.text}
            </p>
          ) : null}
        </form>

        {isAdmin ? <h3 className={styles.sectionTitle}>{t("queueTitle")}</h3> : null}
        {!isAdmin ? null : loadError ? (
          <p className={styles.msgError} role="alert">
            {t("loadFailed")}{" "}
            <button type="button" className={styles.linkBtn} onClick={load}>
              {t("retry")}
            </button>
          </p>
        ) : tracks === null ? (
          <p className={styles.empty}>{t("loading")}</p>
        ) : tracks.length === 0 ? (
          <p className={styles.empty}>{t("queueEmpty")}</p>
        ) : (
          <ol className={styles.queue}>
            {tracks.map((row) => {
              const current = row.id === currentId;
              const busy = busyId === row.id;
              return (
                <li key={row.id} className={`${styles.queueRow} ${current ? styles.queueCurrent : ""}`} aria-current={current ? "true" : undefined}>
                  <span className={styles.queueText}>
                    <span className={styles.rowTitle}>
                      {row.title}
                      {current ? <span className={styles.nowTag}>{t("nowTag")}</span> : null}
                    </span>
                    <span className={styles.rowMeta}>
                      {row.artist || t("unknownArtist")} · {formatTime(row.durationSec)}
                    </span>
                  </span>
                  {confirmId === row.id ? (
                    <span className={styles.confirm} role="group" aria-label={t("deleteConfirm", { title: row.title })}>
                      <button type="button" className={styles.dangerBtn} disabled={busy} onClick={() => void run(row.id, () => deleteRadioTrack(row.id))}>
                        {t("deleteYes")}
                      </button>
                      <button type="button" className={styles.ghostBtn} disabled={busy} onClick={() => setConfirmId(null)}>
                        {t("cancel")}
                      </button>
                    </span>
                  ) : (
                    <span className={styles.rowActions}>
                      <button type="button" className={styles.iconBtn} disabled={busy} onClick={() => setConfirmId(row.id)} aria-label={t("delete", { title: row.title })}>
                        <Trash2 size={16} aria-hidden />
                      </button>
                    </span>
                  )}
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </Sheet>
  );
}
