"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import FlockSheet from "./FlockSheet";
import { fetchCastlesLobby } from "./flockApi";
import { sideSkins, type CastlesLobby, type Team } from "./flockCastles";
import { drawCreature } from "./flockRender";
import { skinOf } from "./flockSkins";
import styles from "./FlockInfo.module.scss";

type Props = {
  canPlay: boolean;
  /** Помилка від сервера при останній спробі входу (сторона зайнята, скін не підходить...). */
  error?: string | null;
  onJoin: (team: Team, skin: number) => void;
  onClose: () => void;
};

const SIDE_KEY = "christapp:flock:castles:side";
const SKIN_KEY = "christapp:flock:castles:skin";
const POLL_MS = 3000;

const loadNum = (key: string) => {
  try {
    const v = Number(localStorage.getItem(key));
    return Number.isInteger(v) && v > 0 ? v : 0;
  } catch {
    return 0;
  }
};
const saveNum = (key: string, v: number) => {
  try {
    localStorage.setItem(key, String(v));
  } catch {
    /* ignore */
  }
};

function Preview({ skinId }: { skinId: number }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const cv = ref.current;
    const ctx = cv?.getContext("2d");
    if (!cv || !ctx) return;
    const size = 52;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = cv.height = size * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawCreature(ctx, skinOf(skinId), size / 2, size / 2 + 1, size * 0.36, 0.5, 0, 0, 0);
  }, [skinId]);
  return <canvas ref={ref} style={{ width: 52, height: 52 }} aria-hidden />;
}

/**
 * Лобі режиму «Замки»: спершу сторона («Вівці» / «Вовки», видно скільки людей уже на кожній; сервер не дає зайняти сторону,
 * де людей більше на 2+), потім безкоштовний скін цієї сторони. Платні, особливі скіни й артефакти в режимі вимкнені.
 */
export default function FlockCastlesLobby({ canPlay, error, onJoin, onClose }: Props) {
  const t = useTranslations("flock.castles");
  const [lobby, setLobby] = useState<CastlesLobby | null>(null);
  const [team, setTeam] = useState<Team | null>(() => {
    const v = loadNum(SIDE_KEY);
    return v === 1 || v === 2 ? v : null;
  });
  const [skin, setSkin] = useState(0);

  useEffect(() => {
    let alive = true;
    const tick = () => {
      fetchCastlesLobby()
        .then((l) => alive && setLobby(l))
        .catch(() => undefined);
    };
    tick();
    const id = setInterval(tick, POLL_MS);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  const count = (tm: Team) => (lobby ? (tm === 1 ? lobby.sheep : lobby.wolves) : 0);
  /** Сторона недоступна: там людей на 2+ більше, ніж на іншій (або команда повна). */
  const blocked = (tm: Team) => {
    if (!lobby) return false;
    const other = tm === 1 ? lobby.wolves : lobby.sheep;
    return count(tm) - other >= 2 || count(tm) >= lobby.maxTeamSize;
  };

  const skins = team ? sideSkins(team) : [];
  const picked = team && skins.includes(skin) ? skin : team ? (skins.includes(loadNum(SKIN_KEY)) ? loadNum(SKIN_KEY) : skins[0]) : 0;

  const choose = (tm: Team) => {
    if (blocked(tm)) return;
    setTeam(tm);
    saveNum(SIDE_KEY, tm);
  };

  const sideName = (tm: Team) => t(tm === 1 ? "sheep" : "wolves");
  const disabled = !canPlay || !team || blocked(team) || lobby?.enabled === false;

  return (
    <FlockSheet title={t("lobbyTitle")} closeLabel={t("close")} onClose={onClose} testId="flock-castles-lobby">
      {() => (
        <>
          <p className={styles.modeText}>{t("step1")}</p>
          <div className={styles.sideRow}>
            {([1, 2] as Team[]).map((tm) => (
              <button
                key={tm}
                type="button"
                className={[styles.sideBtn, tm === 1 ? styles.sideSheep : styles.sideWolf, team === tm ? styles.sideActive : ""].filter(Boolean).join(" ")}
                disabled={blocked(tm)}
                aria-pressed={team === tm}
                onClick={() => choose(tm)}
              >
                <strong>{sideName(tm)}</strong>
                <span>{t("people", { n: count(tm) })}</span>
                {blocked(tm) ? <em>{t("sideBlocked")}</em> : null}
              </button>
            ))}
          </div>
          {team ? (
            <>
              <p className={styles.modeText}>{t("step2")}</p>
              <div className={styles.skinRow}>
                {skins.map((id) => (
                  <button
                    key={id}
                    type="button"
                    className={[styles.skinBtn, picked === id ? styles.skinBtnActive : ""].filter(Boolean).join(" ")}
                    aria-pressed={picked === id}
                    onClick={() => {
                      setSkin(id);
                      saveNum(SKIN_KEY, id);
                    }}
                  >
                    <Preview skinId={id} />
                  </button>
                ))}
              </div>
              <p className={styles.modeHint}>{t("skinsNote")}</p>
            </>
          ) : null}
          {lobby?.enabled === false ? <p className={styles.modeHint}>{t("off")}</p> : null}
          {error ? <p className={styles.modeHint} role="alert">{error}</p> : null}
          <div className={styles.modeFooter}>
            <button type="button" className={styles.modePlay} disabled={disabled} onClick={() => team && onJoin(team, picked)}>
              {canPlay ? t("join") : t("connecting")}
            </button>
          </div>
        </>
      )}
    </FlockSheet>
  );
}
