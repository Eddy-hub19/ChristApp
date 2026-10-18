import { useTranslations } from "next-intl";

/** Іконки з game-icons.net, використані в застосунку (CC BY 3.0 вимагає вказати авторів). */
export const GAME_ICON_CREDITS = [
  { name: "Cut diamond", author: "Lorc", url: "https://game-icons.net/1x1/lorc/cut-diamond.html" },
] as const;

export default function IconCredits({ className }: { className?: string }) {
  const t = useTranslations("profile.iconCredits");
  return (
    <section className={className} aria-labelledby="icon-credits-title">
      <h2 id="icon-credits-title" style={{ fontSize: 14, margin: "0 0 4px" }}>
        {t("title")}
      </h2>
      <p style={{ margin: "0 0 4px", fontSize: 12, opacity: 0.75 }}>
        <a href="https://game-icons.net" target="_blank" rel="noopener noreferrer">
          game-icons.net
        </a>
        {" · "}
        <a href="https://creativecommons.org/licenses/by/3.0/" target="_blank" rel="noopener noreferrer">
          CC BY 3.0
        </a>
        {" — "}
        {t("note")}
      </p>
      <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, opacity: 0.75 }}>
        {GAME_ICON_CREDITS.map((c) => (
          <li key={c.name}>
            <a href={c.url} target="_blank" rel="noopener noreferrer">
              {c.name}
            </a>{" "}
            — {c.author}
          </li>
        ))}
      </ul>
    </section>
  );
}
