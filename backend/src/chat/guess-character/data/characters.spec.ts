import { readFileSync } from 'fs';
import { join } from 'path';
import { BIBLE_BOOKS } from './bible-books';
import { CHARACTER_DEFS, CHARACTERS } from './characters';
import { TRAIT_IDS, TRAITS, TRAIT_GROUPS } from './traits';

const LANGS = ['ua', 'ru', 'en'] as const;
const byId = Object.fromEntries(CHARACTERS.map((c) => [c.id, c]));

describe('character data', () => {
  it('has at least 60 characters with unique ids across all three difficulty levels', () => {
    expect(CHARACTERS.length).toBeGreaterThanOrEqual(60);
    expect(new Set(CHARACTERS.map((c) => c.id)).size).toBe(CHARACTERS.length);
    for (const level of [1, 2, 3]) {
      expect(
        CHARACTERS.filter((c) => c.difficulty === level).length,
      ).toBeGreaterThanOrEqual(10);
    }
  });

  it('has traits with unique ids that belong to a known group', () => {
    expect(new Set(TRAIT_IDS).size).toBe(TRAIT_IDS.length);
    for (const t of TRAITS) expect(TRAIT_GROUPS).toContain(t.group);
    for (const g of TRAIT_GROUPS)
      expect(TRAITS.some((t) => t.group === g)).toBe(true);
  });

  it('fills every trait for every character and only uses known trait ids', () => {
    for (const def of CHARACTER_DEFS) {
      const listed = [...def.yes, ...(def.unknown ?? [])];
      for (const id of listed)
        expect([def.id, id, TRAIT_IDS.includes(id)]).toEqual([
          def.id,
          id,
          true,
        ]);
      expect(new Set(listed).size).toBe(listed.length); // нема дублів і перетину yes/unknown
    }
    for (const c of CHARACTERS) {
      expect(Object.keys(c.traits).sort()).toEqual([...TRAIT_IDS].sort());
      for (const id of TRAIT_IDS)
        expect(['yes', 'no', 'unknown']).toContain(c.traits[id]);
    }
  });

  it('has names, descriptions and valid Bible references in every language', () => {
    for (const c of CHARACTERS) {
      for (const lang of LANGS) {
        expect(c.name[lang].trim()).not.toBe('');
        expect(c.about[lang].trim().length).toBeGreaterThan(40);
      }
      expect(c.refs.length).toBeGreaterThan(0);
      for (const r of c.refs) {
        expect(r.book).toBeGreaterThanOrEqual(1);
        expect(r.book).toBeLessThanOrEqual(BIBLE_BOOKS.length);
        expect(r.chapter).toBeGreaterThan(0);
      }
    }
    expect(BIBLE_BOOKS).toHaveLength(66);
  });

  it('keeps names unique, so the picker never shows two identical entries', () => {
    for (const lang of LANGS) {
      expect(new Set(CHARACTERS.map((c) => c.name[lang])).size).toBe(
        CHARACTERS.length,
      );
    }
  });

  it('can tell any two characters apart: some trait is yes/no for both and differs', () => {
    const clashes: string[] = [];
    for (let i = 0; i < CHARACTERS.length; i++) {
      for (let j = i + 1; j < CHARACTERS.length; j++) {
        const a = CHARACTERS[i];
        const b = CHARACTERS[j];
        const splits = TRAIT_IDS.some(
          (t) =>
            a.traits[t] !== 'unknown' &&
            b.traits[t] !== 'unknown' &&
            a.traits[t] !== b.traits[t],
        );
        if (!splits) clashes.push(`${a.id} / ${b.id}`);
      }
    }
    expect(clashes).toEqual([]);
  });

  it('has no two characters with an identical set of trait values', () => {
    const seen = new Map<string, string>();
    for (const c of CHARACTERS) {
      const key = TRAIT_IDS.map((t) => c.traits[t]).join(',');
      expect([c.id, seen.get(key)]).toEqual([c.id, undefined]);
      seen.set(key, c.id);
    }
  });

  describe('internal consistency of the trait table', () => {
    it.each(CHARACTERS.map((c) => [c.id, c] as const))('%s', (_id, c) => {
      const t = c.traits;
      // стать
      expect([t.male, t.female].sort()).toEqual(['no', 'yes']);
      // епоха
      expect([t.ot, t.nt].sort()).toEqual(['no', 'yes']);
      // ролі, що можливі лише в певну епоху
      if (t.apostle === 'yes' && c.id !== 'barnabas') expect(t.nt).toBe('yes');
      if (
        t.beforeFlood === 'yes' ||
        t.patriarchs === 'yes' ||
        t.exodus === 'yes' ||
        t.judges === 'yes'
      )
        expect(t.ot).toBe('yes');
      if (t.kings === 'yes' || t.exile === 'yes') expect(t.ot).toBe('yes');
      if (t.jesusTime === 'yes' || t.earlyChurch === 'yes')
        expect(t.nt).toBe('yes');
      // жодна людина не живе одразу до потопу й у час царів
      if (t.beforeFlood === 'yes') expect(t.kings).toBe('no');
      // діти ↔ батько відомого героя
      if (t.parentOfHero === 'yes') expect(t.children).toBe('yes');
      if (t.children === 'no') expect(t.parentOfHero).toBe('no');
      // суддя — лише в епоху суддів
      if (t.judge === 'yes') expect(t.judges).toBe('yes');
      // «не помер» — це не насильницька смерть
      if (t.noDeath === 'yes') expect(t.violentDeath).toBe('no');
    });
  });

  it('includes a few well-known cases correctly', () => {
    expect(byId.elijah.traits.noDeath).toBe('yes');
    expect(byId.enoch.traits.noDeath).toBe('yes');
    expect(byId.moses.traits.noDeath).toBe('no');
    expect(byId.jeremiah.traits.married).toBe('no');
    expect(byId.johnBaptist.traits.miracles).toBe('no');
    expect(byId.peter.traits.fisherman).toBe('yes');
    expect(byId.david.traits.shepherd).toBe('yes');
    expect(byId.paul.traits.renamed).toBe('yes');
    expect(byId.jonah.traits.sea).toBe('yes');
    expect(byId.samson.traits.prison).toBe('yes');
  });
});

describe('translations', () => {
  const messages = (lang: string) =>
    JSON.parse(
      readFileSync(
        join(__dirname, '../../../../../frontend/messages', `${lang}.json`),
        'utf8',
      ),
    ).guessCharacter;

  it.each(LANGS)(
    '%s has a question for every trait and a label for every tab',
    (lang) => {
      const m = messages(lang);
      for (const t of TRAITS)
        expect([t.id, typeof m.traits[t.id]]).toEqual([t.id, 'string']);
      for (const g of TRAIT_GROUPS)
        expect([g, typeof m.groups[g]]).toEqual([g, 'string']);
      expect(Object.keys(m.traits).sort()).toEqual([...TRAIT_IDS].sort());
    },
  );

  it('has the same set of UI strings in all three languages', () => {
    const keys = (o: Record<string, unknown>): string[] =>
      Object.keys(o).sort();
    expect(keys(messages('ru'))).toEqual(keys(messages('ua')));
    expect(keys(messages('en'))).toEqual(keys(messages('ua')));
  });
});
