// eslint-disable-next-line @typescript-eslint/no-var-requires
const validation = require('../../../../scripts/puzzle-images/validation.cjs');

const fill = (r: number, g: number, b: number, pixels = 64 * 64) => {
  const buf = new Uint8Array(pixels * 3);
  for (let i = 0; i < pixels; i += 1) buf.set([r, g, b], i * 3);
  return buf;
};
const mix = (parts: Array<[Uint8Array, number]>) => {
  const out: number[] = [];
  for (const [buf, share] of parts) {
    out.push(...buf.slice(0, Math.round(buf.length * share)));
  }
  return Uint8Array.from(out);
};

describe('puzzle image selection rules', () => {
  it('accepts only Public Domain / PD-Art / PD-old / CC0 licences', () => {
    for (const ok of [
      'Public domain',
      'PD-Art (PD-old-100)',
      'PD-old-100',
      'CC0',
      'PD',
    ]) {
      expect(validation.isAllowedLicense(ok)).toBe(true);
    }
    for (const bad of [
      'CC BY 4.0',
      'CC BY-SA 3.0',
      'CC BY-SA 4.0',
      'Copyrighted',
      '',
      'No restrictions',
      undefined,
    ]) {
      expect(validation.isAllowedLicense(bad)).toBe(false);
    }
  });

  it('rejects black-and-white and grey images', () => {
    expect(
      validation.isColorful(validation.colorMetrics(fill(128, 128, 128))),
    ).toBe(false);
    expect(validation.isColorful(validation.colorMetrics(fill(0, 0, 0)))).toBe(
      false,
    );
    expect(
      validation.isColorful(validation.colorMetrics(fill(250, 250, 250))),
    ).toBe(false);
  });

  it('rejects sepia / toned monochrome images (low saturation tint)', () => {
    // Класичне сепія: тепле, але слабко насичене
    expect(
      validation.isColorful(validation.colorMetrics(fill(180, 160, 135))),
    ).toBe(false);
    expect(
      validation.isColorful(validation.colorMetrics(fill(120, 108, 92))),
    ).toBe(false);
  });

  it('accepts clearly coloured images', () => {
    expect(
      validation.isColorful(validation.colorMetrics(fill(200, 60, 40))),
    ).toBe(true);
    expect(
      validation.isColorful(validation.colorMetrics(fill(40, 90, 200))),
    ).toBe(true);
    // Переважно сіра картина з помітною кольоровою ділянкою (30%) теж кольорова
    const grey = fill(120, 120, 120);
    const blue = fill(30, 80, 200);
    expect(
      validation.isColorful(
        validation.colorMetrics(
          mix([
            [blue, 0.3],
            [grey, 0.7],
          ]),
        ),
      ),
    ).toBe(true);
  });

  it('a tiny coloured speck on a grey picture is not enough', () => {
    const grey = fill(120, 120, 120);
    const red = fill(220, 40, 40);
    expect(
      validation.isColorful(
        validation.colorMetrics(
          mix([
            [red, 0.03],
            [grey, 0.97],
          ]),
        ),
      ),
    ).toBe(false);
  });

  it('keeps the documented thresholds', () => {
    expect(validation.MIN_LONG_SIDE).toBe(1000);
    expect(validation.COLOR_MIN_FRACTION).toBeGreaterThanOrEqual(0.08);
    expect(validation.COLOR_MIN_MEAN_SATURATION).toBeGreaterThanOrEqual(0.12);
  });
});
