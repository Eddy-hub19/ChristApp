"use client";

import { useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { Volume2, VolumeX } from "lucide-react";
import { DEFAULT_SOUND_SETTINGS, getFlockSoundSettings, setFlockSoundSettings, subscribeFlockSound, unlockFlockSound } from "./flockSound";
import FlockSheet from "./FlockSheet";
import styles from "./FlockSound.module.scss";

export function useFlockSoundSettings() {
  return useSyncExternalStore(subscribeFlockSound, getFlockSoundSettings, () => DEFAULT_SOUND_SETTINGS);
}

type BtnProps = { variant: "hud" | "lobby"; onOpen: () => void };

/** Маленькая кнопка динамика: значок показывает, включён ли звук; нажатие открывает настройки. */
export function FlockSoundButton({ variant, onOpen }: BtnProps) {
  const t = useTranslations("flock");
  const s = useFlockSoundSettings();
  const on = s.enabled && s.volume > 0;
  return (
    <button
      type="button"
      className={`${variant === "hud" ? styles.hudBtn : styles.lobbyBtn} ${on ? "" : styles.off}`}
      onClick={() => {
        unlockFlockSound();
        onOpen();
      }}
      aria-label={t("sound.open")}
      title={t("sound.open")}
      aria-haspopup="dialog"
    >
      {on ? <Volume2 size={variant === "hud" ? 18 : 15} aria-hidden /> : <VolumeX size={variant === "hud" ? 18 : 15} aria-hidden />}
    </button>
  );
}

/** Настройки звука в той же шторке, что «Про гру» и «Артефакти». */
export default function FlockSoundSettings({ onClose }: { onClose: () => void }) {
  const t = useTranslations("flock");
  const s = useFlockSoundSettings();
  return (
    <FlockSheet title={t("sound.title")} closeLabel={t("info.close")} onClose={onClose} testId="flock-sound">
      {() => (
        <div className={styles.rows}>
          <div className={styles.row}>
            <span id="flock-snd-on">{t("sound.enabled")}</span>
            <button type="button" role="switch" aria-checked={s.enabled} aria-labelledby="flock-snd-on" className={styles.switch} onClick={() => setFlockSoundSettings({ enabled: !s.enabled })} />
          </div>
          <div className={styles.row}>
            <label htmlFor="flock-snd-vol">{t("sound.volume")}</label>
            <span className={styles.slider}>
              <input id="flock-snd-vol" type="range" min={0} max={100} step={5} value={Math.round(s.volume * 100)} onChange={(e) => setFlockSoundSettings({ volume: Number(e.target.value) / 100 })} />
              <output htmlFor="flock-snd-vol">{Math.round(s.volume * 100)}%</output>
            </span>
          </div>
          <div className={styles.row}>
            <span id="flock-snd-amb">{t("sound.ambient")}</span>
            <button type="button" role="switch" aria-checked={s.ambient} aria-labelledby="flock-snd-amb" className={styles.switch} onClick={() => setFlockSoundSettings({ ambient: !s.ambient })} />
          </div>
          <p className={styles.hint}>{t("sound.iosHint")}</p>
        </div>
      )}
    </FlockSheet>
  );
}
