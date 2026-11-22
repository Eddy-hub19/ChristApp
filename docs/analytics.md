# Аналитика (Google Tag Manager + GA4)

Приложение отправляет в `dataLayer` анонимные события, а Google Tag Manager (GTM) раздаёт их в GA4.
Всё идёт через один модуль — [`apps/web/src/lib/analytics.ts`](../apps/web/src/lib/analytics.ts) (`track(event, params)`).

## Как это включается

| Условие | Поведение |
| --- | --- |
| `NEXT_PUBLIC_GTM_ID` не задан или не `GTM-XXXXXXX` | Ничего не грузится, баннера и строки «Аналітика» нет, `track()` — пустая операция. Приложение работает как раньше. |
| ID задан, выбора ещё нет | Создаётся `dataLayer`, в него кладётся `consent default` (`denied` для всех четырёх сигналов). Скрипт GTM **не грузится**, запросов к Google нет. События копятся в памяти (до 30 штук, только на время сессии). Показывается баннер. |
| «Прийняти» | `consent update: analytics_storage = granted` (рекламные сигналы остаются `denied`), копившиеся события уходят в `dataLayer`, грузится `gtm.js` (после гидрации, `next/script`, `afterInteractive`). |
| «Відхилити» / выключено в профиле | Буфер выбрасывается, `consent update: analytics_storage = denied`, cookie `_ga*` удаляются, события не отправляются. Приложение работает полностью. |

Режим согласия — **Basic Consent Mode**: до согласия контейнер вообще не загружается (нет даже cookieless-пингов).
`NEXT_PUBLIC_GTM_ID` читается **при сборке** (передаётся build-arg в `Dockerfile`, `docker-bake.hcl`, оба compose-файла, см. `.env.example`).

Контейнер не загружается на `/admin`. Если он уже был загружен до перехода в админку (клиентская навигация), он остаётся в памяти, но `track()` в админке ничего не шлёт.

## Правила приватности (обязательные)

- В `dataLayer` не попадают: ник, имя, email, userId, id чатов/сообщений, тексты сообщений и черновиков, названия комнат и видео, номера и тексты стихов, заметки, имена людей, IP, токены, баланс валюты в привязке к человеку.
- В GA4 **не передаётся** `user_id` ни в каком виде (включая хеш). В GTM не настраивать User-ID.
- Экраны `/admin` и `/choose-nickname`: события не отправляются вообще. Экраны входа/регистрации: только `page_view` со шаблоном `/login` или `/register`.
- Вход и регистрация (`login`, `sign_up_completed`) отправляются отложенно — на первом экране приложения после входа (в `sessionStorage` хранится только «тип:способ»).
- Параметры типизированы каталогом `AnalyticsEvents`: лишний параметр не компилируется. Санитайзер дополнительно отбрасывает любое значение, похожее на email, uuid, длинный id (20+ символов без пробелов), число из 9+ цифр, и любую строку длиннее 50 символов.
- Защита от частоты: одинаковое событие (с теми же параметрами) не чаще раза в секунду, потолок — 60 событий в минуту.
- `page_view` отправляется при смене экрана с **шаблоном** пути: `/chat/[id]`, `/bible/[book]/[chapter]`, `/games`; неизвестные маршруты → `/other`.
- Книга и глава Библии не отправляются: только `bible_chapter_view` с категорией Завета (`old`/`new`).
- В игре «Отара» события только на значимые действия (вход в матч, итог, покупка и т. д.), не на тиках и не в игровом цикле.

## Каталог событий

`page_path`/`page_location` в `page_view` — шаблон пути. Пример `dataLayer.push`:
`{ event: "chat_message_sent", kind: "text", chat: "dm" }`.

| Событие | Когда | Параметры | Где вызывается |
| --- | --- | --- | --- |
| `page_view` | смена экрана | `page_path`, `page_location` (шаблон) | `AnalyticsRoot` |
| `app_open` | запуск сессии | `mode`: `standalone`/`browser` | `AnalyticsRoot` |
| `pwa_install_prompt_shown` | плашка установки показана | `platform`: `chromium`/`ios` | `PwaInstallPrompt` |
| `pwa_install_prompt_accepted` | установка принята | — | `PwaInstallPrompt` |
| `sign_up_completed` | регистрация завершена | `method`: `password`/`google` | `useAuth` → отложенно |
| `login` | вход | `method`: `password`/`google` | `useAuth`, `googleAuth` → отложенно |
| `logout` | выход пользователем | — | `useAuth` |
| `google_connect` | Google привязан к аккаунту | — | `GoogleSettingsRow` |
| `language_change` | смена языка | `lang`: `en`/`ru`/`ua` | `LanguageSwitcher` |
| `theme_change` | смена темы | `theme`: `light`/`dark` | `ThemeToggle` |
| `notifications_permission` | ответ на запрос разрешения | `result`: `granted`/`denied` | `lib/notifications` |
| `chat_message_sent` | сообщение отправлено | `kind`: `text`/`photo`/`voice`/`file`/`sticker`/`audio`/`video`, `chat`: `dm`/`global` | чат (`trackChatMessageSent`), `useChatUploads` |
| `reaction_added` | поставлена реакция | — | чат |
| `message_pinned` | закреплено сообщение | — | чат |
| `mention_used` | в тексте есть @упоминание (текст не отправляется) | — | `trackChatMessageSent` |
| `call_started` / `call_answered` / `call_declined` / `call_missed` | звонки | — | `CallProvider` |
| `call_ended` | звонок завершён | `duration_s` | `CallProvider` |
| `chat_background_change` | сохранён фон чата | `id` (id фона из каталога) | `ChatBackgroundSettings` |
| `chat_font_change` | сохранён размер шрифта | `id` (`sm`/`md`/`lg`…) | `FontSettings` |
| `bubble_style_change` | сохранён стиль пузырей | `id` (id стиля) | `BubbleStyleSettings` |
| `bible_open` | открыт читалка Библии | — | `BibleReader` |
| `bible_translation_change` | выбран перевод | `translation` | `BibleReader` |
| `bible_search` | выполнен поиск | `query_length`, `results` | `BibleSearchPanel` |
| `bible_chapter_view` | глава прочитана (~2 с внизу текста) | `testament`: `old`/`new` | `BibleReader` |
| `verse_saved` | стих сохранён | — | `versesApi.saveVerse` |
| `cinema_room_created` | создана комната | — | `watchRoomsQueries` |
| `cinema_provider` | источник видео в созданной комнате | `provider`: `youtube`/`vimeo`/`file`/`other` | `watchRoomsQueries` |
| `cinema_room_joined` | вход по ссылке или принятие приглашения | — | `watchRoomsQueries` |
| `game_open` / `game_start` | показана мини-игра чата | `game`: `doodle`/`snake`/`guess`/`filword`/`puzzle` | `useGameAnalytics` |
| `game_end` | игра закрыта | `game`, `result` (`end`), `duration_s` | `useGameAnalytics` |
| `puzzle_custom_image_uploaded` | загружена своя картинка пазла | — | `puzzleImages` |
| `otara_lobby_open` | лобби показано | — | `FlockMiniGame` |
| `otara_play_click` | нажата «Грати» | — | `FlockMiniGame` |
| `otara_match_start` | матч начался (статус `playing`) | `map`, `mode` | `flockAnalytics` |
| `otara_match_end` | матч закончился | `map`, `duration_s`, `place` (`top1`/`top3`/`top10`/`other`), `outcome` (`died`/`left`) | `flockAnalytics` |
| `otara_skin_selected` | выбран скин | `category` (`free`/`paid`/`premium`/`special`/`legendary`) | `FlockMiniGame` |
| `otara_skin_purchase_click` | нажата «Купити» на скине | `category` | `FlockMiniGame` |
| `otara_skin_purchased` | скин куплен | `category`, `currency`, `price` | `FlockMiniGame` |
| `otara_artifact_purchased` | артефакт куплен | `currency`, `price` | `FlockMiniGame` |
| `otara_quest_claimed` | награда за задание получена | `difficulty` (`easy`/`medium`/`hard`), `reward` | `FlockQuests` |
| `otara_whats_new_open` | показано «Що нового» | — | `FlockMiniGame` |
| `otara_announcement_click` | нажата кнопка анонса «Отары» | — | `OtaraAnnouncement` |
| `otara_mode_selected` | выбран режим «Замки» | `mode` | `FlockMiniGame` |
| `otara_sound_toggle` | звук включён/выключен | `enabled` | `flockSound` |
| `client_error` | необработанная ошибка JS/промиса | `category` (`js`/`promise`), `code` (имя типа ошибки) | `AnalyticsRoot` |
| `socket_disconnect_long` | обрыв сокета ≥ 30 с, при восстановлении | `duration_s` | `PresenceSocket` |

Пример `page_view`: `{ event: "page_view", page_path: "/chat/[id]", page_location: "https://example.com/chat/[id]" }`.

### Намеренно не реализовано (нет такой функции в приложении или нарушает правила)

- `sign_up_started` — происходит на экране входа, где события запрещены.
- `update_banner_shown/accepted` — баннера обновления нет (Service Worker обновляется молча).
- `draft_restored` — черновиков в чате нет.
- `cinema_player_setting` (скорость) — в плеере Киношки нет настройки скорости.

## Настройка GTM

1. **Переменная окружения.** В `.env.production` / build-args: `NEXT_PUBLIC_GTM_ID=GTM-XXXXXXX`, затем пересобрать образ.
2. **Переменные Data Layer** (Variables → User-Defined → Data Layer Variable, версия 2), по одной на параметр: `page_path`, `page_location`, `method`, `kind`, `chat`, `lang`, `theme`, `result`, `duration_s`, `game`, `map`, `mode`, `place`, `outcome`, `category`, `currency`, `price`, `difficulty`, `reward`, `enabled`, `testament`, `translation`, `query_length`, `results`, `provider`, `platform`, `code`, `id`.
3. **Тег GA4.** Тип «Google tag» (или GA4 Configuration) с вашим Measurement ID:
   - Consent Settings → Built-in consent checks: *Require additional consent for tag to fire* = `analytics_storage`.
   - Отключить автоматический `page_view`: в Configuration settings добавить `send_page_view = false`. Отключить Enhanced Measurement «Page changes based on browser history events» (иначе уйдёт реальный URL с id).
   - Configuration settings: `page_location = {{DLV page_location}}`, `page_title = ""` (чтобы реальный URL и заголовок с id не попадали в GA4).
   - Никаких User-ID / `user_id`.
   - В Admin GA4 → Data collection: выключить Google signals и все рекламные функции; Data retention задать явно (и записать то же значение в `GA4_RETENTION` в `src/content/legal.tsx`).
4. **Тег события `page_view`.** Тип GA4 Event, Event Name `page_view`, параметры `page_location`/`page_path` из переменных; триггер Custom Event `page_view`.
5. **Остальные события.** Тип GA4 Event; Event Name = `{{Event}}` (встроенная переменная) с одним триггером Custom Event, регулярное выражение по именам каталога (`^(app_open|login|logout|…|otara_.*)$`), либо отдельные триггеры. Параметры события — из Data Layer Variables выше.
6. **Рекламные теги не подключать.** `ad_storage`, `ad_user_data`, `ad_personalization` всегда `denied`.

### Проверка в Preview

1. Собрать с `NEXT_PUBLIC_GTM_ID`, открыть приложение, Tag Assistant → Connect (или GTM → Preview).
2. До выбора в баннере: в Network нет запросов к `googletagmanager.com` и `google-analytics.com`; в консоли `dataLayer[0]` — `consent default` со всеми `denied`.
3. «Прийняти»: в Preview появляются `Consent`, `Container Loaded`, затем накопившиеся события; в Consent-вкладке `analytics_storage = granted`, остальные `denied`.
4. Выполнить действия (открыть Библию, отправить сообщение, сменить тему): в Preview — события с параметрами из каталога, без текста и id.
5. Профиль → Налаштування → Аналітика выключить: новые события не появляются, cookie `_ga*` удалены.
6. `/admin`: контейнер не грузится при заходе напрямую, событий нет.
7. В dev (`npm run dev`) каждое событие дублируется в консоль: `[analytics] push|buffer|skip(...) <event>`.

## Content-Security-Policy

В приложении нет CSP для страниц: заголовки безопасности (`next.config.ts`) — только `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`. Поэтому в CSP страниц ничего не добавлялось и ничего не ломается.
CSP, заданная только для `/sw.js` (`script-src 'self'`, `connect-src …`), не менялась: Service Worker не делает запросов к аналитике (см. ниже).
Если когда-нибудь будет добавлена CSP страниц, для GTM+GA4 нужны источники:

- `script-src`: `https://www.googletagmanager.com`
- `connect-src`: `https://www.google-analytics.com https://*.google-analytics.com https://*.analytics.google.com https://www.googletagmanager.com`
- `img-src`: `https://www.google-analytics.com https://*.google-analytics.com https://www.googletagmanager.com`

`<noscript>`-iframe GTM не используется намеренно: без JavaScript согласие получить нельзя, а iframe загрузил бы контейнер без согласия.

## Service Worker

`public/sw.js`: запросы к `googletagmanager.com`, `google-analytics.com`, `analytics.google.com`, `doubleclick.net` не перехватываются и не кешируются (`shouldBypassSwFetch`). Версию кеша поднимать не пришлось.

## Ручные шаги владельца

1. Создать/использовать контейнер GTM; ID контейнера, как в вашем сниппете (`GTM-NHK25ZDB`), прописать **только** в окружении сборки: `NEXT_PUBLIC_GTM_ID=GTM-NHK25ZDB`. В код ID не вписан. Сниппет `gtag('js', …)` + `gtm.js` из задачи вставлять не нужно: приложение подключает GTM само, после согласия.
2. В GTM настроить переменные, тег GA4 и триггеры (раздел выше), опубликовать контейнер.
3. В GA4: отключить Google signals и рекламу, задать срок хранения данных (Data retention) и записать его в `GA4_RETENTION` в `apps/web/src/content/legal.tsx` (пока `null` — фраза о сроке в Privacy Policy не выводится).
4. Перед включением на проде прочитать раздел «5. Analytics» в Privacy Policy: он описывает режим «GA4 через GTM после согласия». Если GA4 в контейнере не подключается — текст нужно скорректировать.
5. Проверить в Preview GTM и GA4 DebugView (раздел «Проверка»), на iOS-PWA (Safari/«На экран Домой») проверить баннер, переключатель и отсутствие запросов до согласия.
