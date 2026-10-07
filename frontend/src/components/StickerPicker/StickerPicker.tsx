"use client";

import { useState } from "react";
import Image from "next/image";
import styles from "./StickerPicker.module.scss";

export type StickerItem = {
  id: string;
  path: string;
  label: string;
};

const makeStickers = (
  idPrefix: string,
  pathPrefix: string,
  ext: string,
  count: number,
): StickerItem[] =>
  Array.from({ length: count }, (_, index) => ({
    id: `${idPrefix}_${index + 1}`,
    path: `${pathPrefix}${index + 1}.${ext}`,
    label: `Стикер ${index + 1}`,
  }));

export type StickerPack = {
  id: string;
  label: string;
  stickers: StickerItem[];
};

/** Перший пак — оригінальний (id/шляхи лишаються, бо їх зберігають старі повідомлення). */
export const STICKER_PACKS: StickerPack[] = [
  {
    id: "classic",
    label: "Класика",
    stickers: makeStickers("jesus", "/stickers/jesus", "webp", 12),
  },
  {
    id: "kawaii",
    label: "Мілі",
    stickers: makeStickers("kawaii", "/stickers/kawaii/kawaii", "svg", 12),
  },
];

export const STICKERS: StickerItem[] = STICKER_PACKS.flatMap(
  (pack) => pack.stickers,
);

type StickerPickerProps = {
  onSelect: (sticker: StickerItem) => void;
};

export default function StickerPicker({ onSelect }: StickerPickerProps) {
  const [activePackId, setActivePackId] = useState(STICKER_PACKS[0].id);
  const activePack =
    STICKER_PACKS.find((pack) => pack.id === activePackId) ?? STICKER_PACKS[0];

  return (
    <div className={styles.container}>
      <div className={styles.tabs} role="tablist" aria-label="Набори стикерів">
        {STICKER_PACKS.map((pack) => (
          <button
            key={pack.id}
            type="button"
            role="tab"
            aria-selected={pack.id === activePack.id}
            aria-label={pack.label}
            title={pack.label}
            className={`${styles.tab} ${pack.id === activePack.id ? styles.tabActive : ""}`}
            onClick={() => setActivePackId(pack.id)}
          >
            <Image
              src={pack.stickers[0].path}
              alt=""
              width={22}
              height={22}
              className={styles.tabImage}
            />
          </button>
        ))}
      </div>
      <div className={styles.grid}>
        {activePack.stickers.map((sticker) => (
          <button
            key={sticker.id}
            type="button"
            className={styles.item}
            onClick={() => onSelect(sticker)}
            aria-label={`Отправить стикер: ${sticker.label}`}
            title={sticker.label}
          >
            <Image
              src={sticker.path}
              alt={sticker.label}
              width={40}
              height={40}
              className={styles.stickerImage}
            />
          </button>
        ))}
      </div>
    </div>
  );
}
