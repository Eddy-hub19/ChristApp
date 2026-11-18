import {
  parseLegacyReplyPrefix,
  stripLegacyReplyPrefix,
} from './legacy-reply-prefix';

const legacy = (meta: object, text: string) =>
  `[[reply:${encodeURIComponent(JSON.stringify(meta))}]]${text}`;

describe('stripLegacyReplyPrefix', () => {
  it('leaves plain text untouched', () => {
    expect(stripLegacyReplyPrefix('Привіт, світе')).toBe('Привіт, світе');
  });

  it('strips the legacy reply prefix', () => {
    const raw = legacy({ id: 'm1', username: 'bob', content: 'давнє' }, 'Так!');
    expect(stripLegacyReplyPrefix(raw)).toBe('Так!');
  });

  it('strips nested prefixes (reply to a reply)', () => {
    const inner = legacy({ id: 'a', username: 'x', content: 'c' }, 'перша');
    const raw = legacy({ id: 'b', username: 'y', content: inner }, 'друга');
    expect(stripLegacyReplyPrefix(raw)).toBe('друга');
    expect(
      stripLegacyReplyPrefix(
        legacy({ id: 'b', username: 'y', content: 'z' }, inner),
      ),
    ).toBe('перша');
  });

  it('never returns raw service text for an unterminated (truncated) prefix', () => {
    const raw = legacy(
      { id: 'm1', username: 'bob', content: 'x'.repeat(400) },
      'текст',
    );
    expect(stripLegacyReplyPrefix(raw.slice(0, 300))).toBe('');
  });

  it('handles empty and nullish input', () => {
    expect(stripLegacyReplyPrefix('')).toBe('');
    expect(stripLegacyReplyPrefix(null)).toBe('');
    expect(stripLegacyReplyPrefix(undefined)).toBe('');
  });

  it('keeps sticker / media payloads that follow a prefix intact', () => {
    const sticker = '[[sticker:cat]]/stickers/cat.png';
    expect(
      stripLegacyReplyPrefix(
        legacy({ id: 'm', username: 'u', content: '' }, sticker),
      ),
    ).toBe(sticker);
  });
});

describe('parseLegacyReplyPrefix', () => {
  it('decodes the outer quote meta', () => {
    const raw = legacy({ id: 'm1', username: 'bob', content: 'давнє' }, 'Так!');
    expect(parseLegacyReplyPrefix(raw)).toEqual({
      text: 'Так!',
      meta: { id: 'm1', username: 'bob', content: 'давнє' },
    });
  });

  it('returns meta=null for a prefix with broken JSON but still strips it', () => {
    expect(parseLegacyReplyPrefix('[[reply:%E0%A4%A]]Текст')).toEqual({
      text: 'Текст',
      meta: null,
    });
  });
});
