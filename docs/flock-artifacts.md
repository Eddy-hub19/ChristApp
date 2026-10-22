# Отара: артефакты

7 предметов поверх любого скина, надет один, покупаются за рубины (`FLOCK_CONFIG.artifacts.price` = 80, отдельно от цен скинов).
Номера (u8, 0 = ничего): 1 Взуття, 2 Шапка священника, 3 Королівська корона, 4 Магніт, 5 Пісочний годинник, 6 Хрест, 7 Кадило.

- БД: `FlockProfile.selectedArtifact`, `FlockArtifactPurchase (userId, artifactId, price)`, `RubyReason.ARTIFACT_PURCHASE`, `RubyTransaction.artifactId`.
- Бонусы считает сервер (`flock.engine.ts`) по `Player.artifact`, который гейтвей берёт из БД при входе (`resolveArtifact`; не куплен → `artifact_locked`). Ботам всегда 0.
- Протокол: артефакт дописан в хвост пакета состояния (`u16 count`, затем `pid u16 + artifact u8` для новых игроков); старые клиенты хвост не читают.
- Отрисовка: `flockArtifacts.ts` (упрощённые формы без свечения и точки крепления по видам), отдельный кэшированный слой в `flockSprites.ts`; у разделённого игрока артефакт рисуется только на самой большой видимой части.
- Иконки лобби: `frontend/public/flock/artifacts/*.webp` (256×256, прозрачный фон).
