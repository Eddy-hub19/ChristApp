/**
 * Ознаки («питання»), якими відгадувач ставить запитання. Тексти питань живуть у перекладах
 * (frontend/messages/*.json → guessCharacter.traits.<id>), тут лише id і тема-вкладка.
 *
 * Значення ознак для кожного персонажа — у characters-*.ts. Нова ознака: додати id сюди,
 * далі проставити її всім персонажам (тест `data.spec.ts` не дасть забути) і додати переклади.
 */
export const TRAIT_GROUPS = [
  'who',
  'time',
  'role',
  'events',
  'family',
] as const;
export type TraitGroup = (typeof TRAIT_GROUPS)[number];

export const TRAITS = [
  // Стать і вік
  { id: 'male', group: 'who' },
  { id: 'female', group: 'who' },
  { id: 'youth', group: 'who' },
  { id: 'elderly', group: 'who' },
  { id: 'rich', group: 'who' },
  // Час
  { id: 'ot', group: 'time' },
  { id: 'nt', group: 'time' },
  { id: 'beforeFlood', group: 'time' },
  { id: 'patriarchs', group: 'time' },
  { id: 'exodus', group: 'time' },
  { id: 'judges', group: 'time' },
  { id: 'kings', group: 'time' },
  { id: 'exile', group: 'time' },
  { id: 'jesusTime', group: 'time' },
  { id: 'earlyChurch', group: 'time' },
  // Роль
  { id: 'prophet', group: 'role' },
  { id: 'king', group: 'role' },
  { id: 'apostle', group: 'role' },
  { id: 'priest', group: 'role' },
  { id: 'judge', group: 'role' },
  { id: 'warrior', group: 'role' },
  { id: 'fisherman', group: 'role' },
  { id: 'shepherd', group: 'role' },
  { id: 'official', group: 'role' },
  { id: 'craftsman', group: 'role' },
  { id: 'opponent', group: 'role' },
  { id: 'foreigner', group: 'role' },
  // Події
  { id: 'angel', group: 'events' },
  { id: 'prison', group: 'events' },
  { id: 'sea', group: 'events' },
  { id: 'miracles', group: 'events' },
  { id: 'wroteBook', group: 'events' },
  { id: 'vision', group: 'events' },
  { id: 'violentDeath', group: 'events' },
  { id: 'noDeath', group: 'events' },
  { id: 'raised', group: 'events' },
  { id: 'captive', group: 'events' },
  { id: 'egypt', group: 'events' },
  { id: 'renamed', group: 'events' },
  // Родина і зв'язки
  { id: 'siblings', group: 'family' },
  { id: 'married', group: 'family' },
  { id: 'children', group: 'family' },
  { id: 'parentOfHero', group: 'family' },
  { id: 'childOfHero', group: 'family' },
] as const satisfies ReadonlyArray<{ id: string; group: TraitGroup }>;

export type TraitId = (typeof TRAITS)[number]['id'];
export const TRAIT_IDS: readonly TraitId[] = TRAITS.map((t) => t.id);

export type TraitValue = 'yes' | 'no' | 'unknown';
