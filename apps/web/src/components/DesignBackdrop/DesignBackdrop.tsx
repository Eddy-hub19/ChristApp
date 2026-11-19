/**
 * Единственный фон нового дизайна (`<html data-design="v2">`): сливовый градиент с тёплыми дугами-«северным сиянием».
 * Чистый CSS, без JS и анимаций; в старом дизайне скрыт. Прячется там же, где и корневой фон чата (`data-app-bg-off`:
 * зал кинотеатра, игра «Отара»). Стили - styles/designV2.scss.
 */
export default function DesignBackdrop() {
  return (
    <div data-design-backdrop aria-hidden>
      <i data-arc="a" />
      <i data-arc="b" />
      <i data-arc="c" />
    </div>
  );
}
