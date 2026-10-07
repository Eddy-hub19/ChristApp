import { existsSync } from 'node:fs';
import path from 'node:path';
import { CHARACTERS } from '../../guess-character/data/characters';
import { PUZZLE_IMAGES, charactersWithImages } from './puzzle-images';

/** Картинки тільки з чіткою вільною ліцензією: кожен запис має автора, назву, рік, сторінку Commons і ліцензію. */
describe('puzzle images data', () => {
  const frontendPublic = path.resolve(
    __dirname,
    '../../../../../frontend/public',
  );

  it('ids are unique and every image points at existing characters', () => {
    const ids = PUZZLE_IMAGES.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
    const known = new Set(CHARACTERS.map((c) => c.id));
    for (const image of PUZZLE_IMAGES) {
      expect(image.characterIds.length).toBeGreaterThan(0);
      for (const id of image.characterIds) expect(known.has(id)).toBe(true);
    }
  });

  it('every image is Public Domain / CC0 and carries full attribution', () => {
    for (const image of PUZZLE_IMAGES) {
      expect(image.license).toMatch(/^(public domain|pd[- ]|pd$|cc0)/i);
      expect(image.author.trim()).not.toBe('');
      expect(image.title.trim()).not.toBe('');
      expect(Number.isInteger(image.year)).toBe(true);
      expect(image.year).toBeGreaterThan(1000);
      expect(image.year).toBeLessThanOrEqual(1925); // чітко до меж суспільного надбання
      expect(image.sourceUrl).toMatch(
        /^https:\/\/commons\.wikimedia\.org\/wiki\/File:/,
      );
      expect(image.commonsTitle).toMatch(/^File:/);
    }
  });

  it('files are WebP in the Cloudinary puzzles folder, and big enough not to blur', () => {
    for (const image of PUZZLE_IMAGES) {
      expect(image.url).toMatch(
        /^https:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\/(v\d+\/)?christapp\/puzzles\/[a-z0-9-]+(\.webp)?$/i,
      );
      expect(image.cloudinaryId).toMatch(/^christapp\/puzzles\//);
      expect(image.url).toContain(image.cloudinaryId);
      expect(Math.max(image.width, image.height)).toBeLessThanOrEqual(1600);
      expect(Math.max(image.width, image.height)).toBeGreaterThanOrEqual(1000);
    }
  });

  it('no binaries of the pictures live in the repository', () => {
    expect(existsSync(path.join(frontendPublic, 'puzzles'))).toBe(false);
  });

  it('the black-and-white Doré engravings are gone', () => {
    for (const image of PUZZLE_IMAGES) {
      expect(image.author).not.toMatch(/dor[eé]/i);
      expect(image.commonsTitle).not.toMatch(/dor[eé]|engraving/i);
    }
  });

  it('every picture has a source line for the credit', () => {
    for (const image of PUZZLE_IMAGES) {
      expect(image.source.trim()).not.toBe('');
      if (image.dateLabel !== undefined)
        expect(image.dateLabel).toMatch(/\d{4}/);
    }
  });

  it('at least 30 characters have a picture; some have several', () => {
    expect(charactersWithImages().length).toBeGreaterThanOrEqual(30);
    const perCharacter = new Map<string, number>();
    for (const image of PUZZLE_IMAGES) {
      for (const id of image.characterIds) {
        perCharacter.set(id, (perCharacter.get(id) ?? 0) + 1);
      }
    }
    expect([...perCharacter.values()].some((n) => n > 1)).toBe(true);
  });
});
