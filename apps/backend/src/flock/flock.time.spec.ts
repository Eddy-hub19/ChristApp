import { dayStartInZone } from './flock.time';

const Z = 'Europe/Kyiv';
const iso = (d: Date) => d.toISOString();

describe('dayStartInZone (доба за Києвом)', () => {
  it('літо (UTC+3): 21:00 UTC вже наступна доба в Києві', () => {
    expect(iso(dayStartInZone(new Date('2026-07-10T20:59:00Z'), Z))).toBe(
      '2026-07-09T21:00:00.000Z',
    );
    expect(iso(dayStartInZone(new Date('2026-07-10T21:00:00Z'), Z))).toBe(
      '2026-07-10T21:00:00.000Z',
    );
  });

  it('зима (UTC+2): межа о 22:00 UTC', () => {
    expect(iso(dayStartInZone(new Date('2026-01-15T10:00:00Z'), Z))).toBe(
      '2026-01-14T22:00:00.000Z',
    );
  });

  it('день переходу на літній час: 25 жовтня 2026 доба триває 25 год, початок за літнім часом', () => {
    // 2026-10-25 04:00 Kyiv: зсув +3 -> +2; північ ще була за літнім (+3)
    expect(iso(dayStartInZone(new Date('2026-10-25T12:00:00Z'), Z))).toBe(
      '2026-10-24T21:00:00.000Z',
    );
  });
});
