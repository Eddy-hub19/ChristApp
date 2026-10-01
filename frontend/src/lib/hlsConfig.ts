import type { HlsConfig } from "hls.js";

/**
 * Налаштування hls.js для Christ App: швидкий старт, помірний буфер (не роздуваємо памʼять
 * на телефонах) і консервативний ABR. Ретраї — через проксі, який сам повертає 4xx/5xx від джерела.
 */
export const HLS_CONFIG: Partial<HlsConfig> = {
  // Швидкий старт і буфер
  startFragPrefetch: true,
  maxBufferLength: 30,
  maxMaxBufferLength: 60,
  maxBufferSize: 60 * 1024 * 1024,

  // Адаптивний бітрейт
  abrEwmaFastLive: 3,
  abrEwmaSlowLive: 9,
  abrBandWidthFactor: 0.95,
  abrBandWidthUpFactor: 0.7,

  // Таймаути й ретраї
  manifestLoadingTimeOut: 10_000,
  manifestLoadingMaxRetry: 3,
  levelLoadingTimeOut: 10_000,
  fragLoadingTimeOut: 20_000,
  fragLoadingMaxRetry: 4,
};

/** Скільки разів поспіль пробуємо відновитись після фатальної помилки, перш ніж здатись. */
export const HLS_MAX_RECOVERY_ATTEMPTS = 3;
