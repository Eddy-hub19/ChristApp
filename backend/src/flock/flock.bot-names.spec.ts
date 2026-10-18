import { BOT_NAMES } from './flock.bot-names';
import { BOT_NAMES as REEXPORTED, pickBotName } from './flock.bots';

describe('імена ботів', () => {
  it('реекспорт із flock.bots - той самий список', () => {
    expect(REEXPORTED).toBe(BOT_NAMES);
  });

  it('не менше 40 унікальних імен (без урахування регістру)', () => {
    expect(BOT_NAMES.length).toBeGreaterThanOrEqual(40);
    expect(new Set(BOT_NAMES.map((n) => n.toLowerCase())).size).toBe(
      BOT_NAMES.length,
    );
  });

  it('усі імена російською: кирилиця, пробіл, без цифр, латиниці й українських літер', () => {
    for (const name of BOT_NAMES) {
      expect(name).toMatch(/^[А-ЯЁа-яё]+( [А-ЯЁа-яё]+)*$/);
      expect(name).not.toMatch(/[іїєґІЇЄҐʼ']/);
      expect(name.length).toBeLessThanOrEqual(18);
      expect(name).toBe(name.trim());
    }
  });

  it('жодного зі старих імен', () => {
    const old = [
      'Овечка Долі',
      'Ягня Сем',
      'Баранчик Бо',
      'Пухнастик',
      'Кучерявка',
      'Хмаринка',
      'Вовчок Сірко',
      'Ягнятко Мі',
      'Рогатик',
      'Сніжинка',
      'Вовна',
    ];
    for (const n of old) expect(BOT_NAMES).not.toContain(n);
  });

  it('на арені з 40 ботами імена не повторюються й без номерів', () => {
    const taken: string[] = [];
    for (let i = 0; i < 40; i += 1) taken.push(pickBotName(Math.random, taken));
    expect(new Set(taken).size).toBe(40);
    for (const n of taken) expect(n).not.toMatch(/\d/);
  });

  it('номер додається лише коли вільні імена скінчилися', () => {
    const full = pickBotName(() => 0, BOT_NAMES);
    expect(full).toBe(`${BOT_NAMES[0]} 2`);
    expect(pickBotName(() => 0, [...BOT_NAMES, full])).toBe(
      `${BOT_NAMES[0]} 3`,
    );
  });
});
