/**
 * Фокус у поле введення чату прямо з обробника жесту (тап / свайп по повідомленню).
 * iOS відкриває або тримає клавіатуру лише тоді, коли `focus()` викликано синхронно
 * всередині жесту; після `await` чи в `useEffect` клавіатура вже не з'явиться.
 */
export function focusChatComposer() {
  if (typeof document === "undefined") return;
  const composer = document.querySelector<HTMLTextAreaElement>("textarea[data-chat-composer]");
  if (!composer || document.activeElement === composer) return;
  // preventScroll: не даємо браузеру «підсувати» сторінку — екран чату сам стоїть над клавіатурою.
  composer.focus({ preventScroll: true });
}
