# Отчёт об уборке репозитория (chore/cleanup)

Поведение приложения не менялось. База: `main` на `b2c0b38`. Итог: **37 файлов удалено, 11 изменено, -3215 / +2 строк, ~0,42 МБ** (blob-ы удалённых файлов).
История git не переписывалась, миграции Prisma, скины, карты, звуки, переводы и `public/` не трогались.

## Что удалено (5 коммитов, каждый проверен отдельно)

1. **Файлы** (5): `apps/backend/migration.sql` (потерянный дамп схемы в UTF-16, нигде не используется), `apps/backend/tests/test-websocket.ts` (ручной скрипт с захардкоженным JWT; токен остаётся в истории git, значение здесь не приводится), `APP_ANALYSIS.md` (устаревший отчёт от 2026-09-16, без ссылок), `docs/img/flock-premium-row2.png`, `docs/img/flock-rainbow-new.png` (скриншоты без ссылок).
2. **Неиспользуемый код** (32 файла + 8 правок): мёртвые компоненты `BibleList`, `BibleMain`, `ChapterViewer`, `DailyBreadEnvelope`, `GlassSurface`, `NoteScene` (+`CodePenCandle`), `PersistenceAchievements`, `PlasmaRoomBackground`, `ProfileChaptersCard`, `ShareButton`; хуки `useBibleReadingProgressSnapshot`, `useDoubleTap`, `useLongPress`; `dailyBreadQueries`, `queryPersistConstants`, `lib/storage.ts`, `store/chat.store.ts`, `styles/variables.scss`, два осиротевших `.module.scss` (`bible/page`, `chat/chat`), `agora-uid.util.ts`. Неиспользуемые импорты (`apiFetch`, `bookPreviewLabel`, `getAuthToken`, `tOnBridge`, `stripLegacyReplyPrefix`) и локальные функции/константы (`sheen`, `hash`, `postW`).
3. **Моки и тестовые данные**: кандидатов нет (отдельных каталогов моков/фикстур в репозитории нет), коммита нет.
4. **Комментарии и логи** (1 строка): отладочный `console.log('✅ Connected:', username)` в `chat.gateway.ts`. Закомментированного кода, `debugger` и TODO в `apps/*/src` нет.
5. **Зависимости**: `ogl` (использовал только удалённый `PlasmaRoomBackground`), обновлён `package-lock.json` (`--package-lock-only`).

Перед удалением каждый кандидат проверялся поиском по импортам, динамическим `import()`/`next/dynamic`, строкам-путям, scss `@use`, документам, package.json и CI.

## Спорное - оставлено (путь, почему)

- `apps/backend/scripts/{flock-load,flock-browser-bench,load-scenarios,cpu-calibrate}.*`, `cfs-throttle.c`: бенчмарки, но на них ссылаются `docs/flock-load*.md`, `docs/flock-perf.md`, `docs/paid-tier-tuning.md` и `cpu-benchmark.service.ts`.
- `apps/backend/scripts/{migrate-legacy-replies.ts,verify-vapid.js}`, `puzzle-images/*`, `apps/web/scripts/generate-*.mjs`: вызываются из package.json или генерируют закоммиченные ассеты.
- `apps/web/public/sw.js`, `next-env.d.ts`: подхватываются Next.js/PWA по имени.
- `apps/backend/test/app.e2e-spec.ts`, `supertest`, `@types/supertest`: скрипт `test:e2e`.
- `@types/socket.io-client`, `source-map-support` (backend): `@types` перекрывает типы v4 (см. комментарий в `watch-party.gateway.spec.ts`), удаление может изменить типизацию; `source-map-support` нужен для debug-запуска Nest. Нужна отдельная проверка.
- `@types/vimeo__player`: knip ошибся, пакет типизирует используемый `@vimeo/player`.
- `apps/web/src/styles/fonts.ts`: шрифт «давній пергамент» остался от удалённого `NoteScene`; возможно, больше не нужен.
- `apps/backend/src/admin/admin.controller.ts:285`: `console.log` аудита админской рассылки, оставлен как операционный лог.
- `private` методы `generateUniqueUsername` (`auth.service.ts`), `getSocketsByUserId` (`chat.gateway.ts`), поле `expectedAt` (`flock.manager.ts`), параметр `configService` (`jwt.strategy.ts`, DI): не используются, но удаление затрагивает DI/публичную поверхность; нужна ручная проверка.
- **142 неиспользуемых `export`** по версии knip (список по запросу: `npx knip@5 --reporter compact`): не трогались, часть импортируется из scripts/тестов, которые knip не считает входами.
- `docs/*.md` и скриншоты в `docs/img`, на которые есть ссылки из этих документов: документы - описания принятых фич; удаление сломает ссылки на картинки. Решение за владельцем.
- `apps/backend/package-lock.json`: не удалялся; CI использует корневой lock, но `apps/backend/Dockerfile` копирует `package-lock.json` - нужна проверка сборки образа.
- Ключи переводов не трогались (в `ua/ru/en` по 2091 ключу, расхождений нет); ключи, которые использовали только удалённые компоненты, остались.

## Проверки и что не удалось проверить

После каждого коммита в отдельной копии (не в `.next` общей папки): `tsc` (web, backend), `nest build`, `next build`, все существующие тесты (backend 649, web 53 файла), сверка ключей ua/ru/en, а также временные проверки критичных путей (не добавлены в репозиторий): вход через `FlockManager.join` на всех включённых картах (обычные и замковые), вход со всеми id скинов, отрисовка всех скинов (`@napi-rs/canvas`, непустые пиксели). Покупка скина проверена интеграционным набором `flock.rubies.service.spec` на временном Postgres (миграции применены, кластер остановлен).

- **4 теста `flock.rubies.service.spec` падают и на чистом `main`** (особые скины: цена 40, проверка при входе, подмена скина). Это существующая проблема ожиданий/конфига, не связанная с уборкой; не правил, так как поведение не менялось.
- Вход через реальный WebSocket-gateway и рендер `drawScene` по картам не проверялись (нужны браузер/БД с пользователями); покрыто слоем менеджера арен и отрисовкой скинов.
- Реальный запуск приложения и Docker-сборки не выполнялись (Docker на машине нет).

## Инцидент во время работы

В общей папке параллельно работала другая сессия Claude: она переключила ветку на `chore/local-only-stack`, и мой `git add -A` захватил её незакоммиченные `README.md`, `docker-compose.dev.yml`, `package.json`. Коммит был пересобран без этих файлов, ветка `chore/local-only-stack` возвращена на `b2c0b38`, её правки остались незакоммиченными в рабочей папке. Дальнейшая работа шла в отдельном клоне.
