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

  it('імена англійською, схожі на ніки гравців: латиниця, цифри, . _, до 18 символів', () => {
    for (const name of BOT_NAMES) {
      expect(name).toMatch(/^[A-Za-z][A-Za-z0-9._]*$/);
      expect(name.length).toBeLessThanOrEqual(18);
    }
  });

  it('нічого грубого, двозначного чи про алкоголь', () => {
    const banned =
      /бодун|пьян|пьяниц|водк|пив[оа]|вин[оа]\b|самогон|кабак|хмел|ликёр|дурак|тупо|глуп|жирн|толст|грозн|убий|кров|смерт|чёрт|черт|бес\b/i;
    for (const name of BOT_NAMES) expect(name).not.toMatch(banned);
  });

  it('на арені з 40 ботами імена не повторюються', () => {
    const taken: string[] = [];
    for (let i = 0; i < 40; i += 1) taken.push(pickBotName(Math.random, taken));
    expect(new Set(taken).size).toBe(40);
    for (const n of taken) expect(n).toMatch(/^\S+$/);
  });

  it('номер додається лише коли вільні імена скінчилися', () => {
    const full = pickBotName(() => 0, BOT_NAMES);
    expect(full).toBe(`${BOT_NAMES[0]}2`);
    expect(pickBotName(() => 0, [...BOT_NAMES, full])).toBe(
      `${BOT_NAMES[0]}3`,
    );
  });
});
