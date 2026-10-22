# Стили пузырей сообщений

Поле `User.bubbleStyle` (строка, `default`), список стилей - `backend/src/config/bubble-styles.ts` и `frontend/src/lib/bubbleStyles.ts`
(новый стиль = id в обоих конфигах, переводы `bubbleStyles.styles.<id>`, блок переменных в `frontend/src/styles/bubbleStyles.scss`).

- **Данные.** Стиль приходит в сообщении (`bubbleStyle` в `newMessage` и истории, `sender.bubbleStyle`), в `/users`, `/auth/me`,
  в `user` сообщений кинотеатра. Смена: `PATCH /users/me { bubbleStyle }` -> событие сокета `userBubbleStyleChanged`
  всем + обновление снимка пользователя в открытых сокетах (новые сообщения берут стиль оттуда).
- **Отрисовка.** Пузырю достаточно атрибутов `data-bubble-style`, `data-bubble-own`, `data-bubble-start`, `data-bubble-tone="dark"`;
  цвета и скругления - CSS-переменные, персонаж - один фон-SVG (`public/bubbles/*.svg`) на группу подряд идущих сообщений одного автора,
  края - два лёгких псевдоэлемента. Без анимаций, `backdrop-filter` и больших теней.
- **Тестовый режим.** `BUBBLE_STYLES_ACCESS` (`admin` | `all`) на сервере и клиенте; в режиме `admin` раздел профиля и стили видит только админ,
  сервер принимает не-`default` стиль только от него.
- **Локальная настройка** «Показувати стилі інших людей» - `localStorage`, по умолчанию включена.
