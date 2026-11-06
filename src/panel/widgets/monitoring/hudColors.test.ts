import { describe, expect, it } from 'vitest';
import { converter } from 'culori';
import { APCAcontrast, sRGBtoY } from 'apca-w3';
import { averageColor, hudColors, readHudSettings, readableAt } from './hudColors';

const toRgb = converter('rgb');
const toOklch = converter('oklch');
const bytes = (hex: string): [number, number, number] => {
  const c = toRgb(hex)!;
  return [Math.round(c.r * 255), Math.round(c.g * 255), Math.round(c.b * 255)];
};
const lc = (a: string, b: string) => Math.abs(APCAcontrast(sRGBtoY(bytes(a)), sRGBtoY(bytes(b))));
const hueDiff = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180);

describe('readableAt', () => {
  it('keeps the asked hue and reaches the contrast against a vivid background', () => {
    for (const bg of ['#ff0040', '#00a0ff', '#40ff00', '#5c0017']) {
      const c = readableAt(200, 1, bg, 60);
      const best = Math.max(lc('#ffffff', bg), lc('#000000', bg));
      expect(lc(c, bg)).toBeGreaterThanOrEqual(Math.min(59, best - 0.5));
      const h = toOklch(c)?.h;
      if (h !== undefined && (toOklch(c)?.c ?? 0) > 0.03) expect(hueDiff(h, 200)).toBeLessThan(12);
    }
  });
});

describe('hudColors', () => {
  const stops = [{ at: 0, color: '#ff0000' }, { at: 0.5, color: '#ff4000' }];

  it('stays colourful while readable instead of washing out to white', () => {
    const c = readableAt(280, 1, '#2040c0', 45);
    expect(toOklch(c)!.c ?? 0).toBeGreaterThan(0.1);
  });

  it('gives nothing in white mode', () => {
    expect(hudColors(stops, readHudSettings({}, 0), 1)).toEqual({});
  });

  it('turns the averaged LED hue by the scheme in average mode', () => {
    const s = readHudSettings({ slot0_hudMode: 'average', slot0_hudScheme: 'complementary', slot0_hudTrack: 'white' }, 0);
    const out = hudColors(stops, s, 1);
    const baseHue = toOklch(averageColor(stops)!)!.h!;
    const valueHue = toOklch((out.value as { color: string }).color)!.h!;
    expect(hueDiff(valueHue, (baseHue + 180) % 360)).toBeLessThan(15);
    expect(out.track).toBeUndefined();
  });

  it('paints the ring as a sweep, one colour per LED, in flow mode', () => {
    const s = readHudSettings({ slot0_hudMode: 'flow' }, 0);
    const out = hudColors(stops, s, 1);
    expect('sweep' in out.ring!).toBe(true);
    expect((out.ring as { sweep: unknown[] }).sweep).toHaveLength(2);
  });
});
