/** Мова інтерфейсу застосунку → мова метаданих TMDB (`ua` у нас — українська, `uk` у TMDB). */
export function tmdbLanguage(lang: string): string {
  switch (lang) {
    case "ua":
      return "uk-UA";
    case "ru":
      return "ru-RU";
    default:
      return "en-US";
  }
}
