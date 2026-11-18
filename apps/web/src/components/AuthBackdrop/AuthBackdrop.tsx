import styles from "./AuthBackdrop.module.scss";

/**
 * Фон экранов входа, стартового экрана и сплеша. Рисует оба варианта; нужный показывает CSS
 * по атрибуту `<html data-auth-theme>` (по умолчанию светлый «шёлк», тёмный — луч сверху и золотые линии).
 * Чисто декоративный: SVG + CSS-анимации, без JS и без перехвата кликов.
 */
export default function AuthBackdrop({
  lightOnly = false,
}: {
  /** Без тёмного варианта (луч и золотые линии): в тёмной теме фон остаётся ровным. Для сплеша. */
  lightOnly?: boolean;
}) {
  return (
    <div className={styles.root} aria-hidden="true">
      <div className={styles.light}>
        <svg
          className={styles.svg}
          viewBox="0 0 1440 900"
          preserveAspectRatio="xMidYMid slice"
          focusable="false"
        >
          <defs>
            <linearGradient id="silk-band" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="#fff" stopOpacity="0" />
              <stop offset="0.5" stopColor="#fff" stopOpacity="0.85" />
              <stop offset="1" stopColor="#fff" stopOpacity="0" />
            </linearGradient>
            <linearGradient id="silk-line" x1="0" y1="1" x2="1" y2="0">
              <stop offset="0" stopColor="#fff" stopOpacity="0" />
              <stop offset="0.5" stopColor="#fff" stopOpacity="0.95" />
              <stop offset="1" stopColor="#fff" stopOpacity="0" />
            </linearGradient>
            <filter id="silk-blur" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="22" />
            </filter>
            <filter id="silk-soft" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="2" />
            </filter>
          </defs>

          <g className={styles.bandA}>
            <path
              d="M-120 470 C 220 250, 560 640, 900 460 S 1420 220, 1580 350 L1580 620 C 1300 480, 1000 740, 700 660 S 200 520, -120 660 Z"
              fill="#8fb0e0"
              filter="url(#silk-blur)"
              opacity="0.32"
            />
            <path
              d="M-120 400 C 220 170, 560 560, 900 380 S 1420 130, 1580 270 L1580 540 C 1300 400, 1000 660, 700 580 S 200 440, -120 580 Z"
              fill="url(#silk-band)"
              filter="url(#silk-blur)"
              opacity="0.8"
            />
          </g>
          <g className={styles.bandB}>
            <path
              d="M-100 760 C 260 620, 560 880, 900 740 S 1380 560, 1560 640 L1560 940 L-100 940 Z"
              fill="url(#silk-band)"
              filter="url(#silk-blur)"
              opacity="0.7"
            />
          </g>
          <g className={styles.lines}>
            <path
              d="M880 920 C 1080 650, 1290 430, 1500 320"
              stroke="url(#silk-line)"
              strokeWidth="2.2"
              fill="none"
              filter="url(#silk-soft)"
            />
            <path
              d="M1000 930 C 1200 680, 1380 500, 1530 430"
              stroke="url(#silk-line)"
              strokeWidth="1.2"
              fill="none"
              filter="url(#silk-soft)"
            />
            <path
              d="M-60 300 C 200 240, 430 340, 720 220"
              stroke="url(#silk-line)"
              strokeWidth="1.2"
              fill="none"
              filter="url(#silk-soft)"
            />
          </g>
        </svg>
      </div>

      {lightOnly ? null : (
        <div className={styles.dark}>
          <div className={styles.beam} />
          <svg
            className={styles.svg}
            viewBox="0 0 1440 900"
            preserveAspectRatio="xMidYMid slice"
            focusable="false"
          >
            <defs>
              <linearGradient id="auth-streak-a" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0" stopColor="#ddb468" stopOpacity="0" />
                <stop offset="0.55" stopColor="#ddb468" stopOpacity="0.55" />
                <stop offset="1" stopColor="#f1cd8a" stopOpacity="0" />
              </linearGradient>
              <filter
                id="auth-streak-blur"
                x="-20%"
                y="-20%"
                width="140%"
                height="140%"
              >
                <feGaussianBlur stdDeviation="6" />
              </filter>
            </defs>
            <g className={styles.streakLeft}>
              <path
                d="M-60 520 C 220 600, 420 700, 760 760"
                stroke="url(#auth-streak-a)"
                strokeWidth="7"
                fill="none"
                filter="url(#auth-streak-blur)"
                opacity="0.55"
              />
              <path
                d="M-60 560 C 240 640, 440 730, 780 790"
                stroke="url(#auth-streak-a)"
                strokeWidth="1.3"
                fill="none"
                opacity="0.95"
              />
            </g>
            <g className={styles.streakRight}>
              <path
                d="M1500 640 C 1260 620, 1080 700, 860 840"
                stroke="url(#auth-streak-a)"
                strokeWidth="7"
                fill="none"
                filter="url(#auth-streak-blur)"
                opacity="0.55"
              />
              <path
                d="M1500 600 C 1280 590, 1100 660, 900 780"
                stroke="url(#auth-streak-a)"
                strokeWidth="1.3"
                fill="none"
                opacity="0.95"
              />
            </g>
            <g className={styles.streakTop}>
              <path
                d="M1500 260 C 1320 300, 1200 220, 1020 120"
                stroke="url(#auth-streak-a)"
                strokeWidth="5"
                fill="none"
                filter="url(#auth-streak-blur)"
                opacity="0.45"
              />
            </g>
          </svg>
        </div>
      )}
    </div>
  );
}
