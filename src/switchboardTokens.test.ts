import { describe, expect, it } from 'vitest';
import {
  SWITCHBOARD_BODY_FONT,
  SWITCHBOARD_DATA_FONT,
  SWITCHBOARD_DISPLAY_FONT,
  SWITCHBOARD_TOKENS,
  type SwitchboardFace,
} from './entries/switchboard';

/**
 * WCAG 2.x contrast, ported from boracaya-mission-control's
 * `src/shared/test/contrast.ts` (itself ported from boracaya-valet's
 * switchboardTheme suite). Reads `#rgb` / `#rrggbb` and `rgb()` / `rgba()`;
 * a translucent foreground is composited over the (opaque) background first,
 * as the browser paints it. Kept inside the spec so it never reaches `dist/`.
 */
type Rgba = [number, number, number, number];

const parse = (colour: string): Rgba => {
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(colour);
  if (short) return [parseInt(short[1].repeat(2), 16), parseInt(short[2].repeat(2), 16), parseInt(short[3].repeat(2), 16), 1];
  const hex = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(colour);
  if (hex) return [parseInt(hex[1], 16), parseInt(hex[2], 16), parseInt(hex[3], 16), 1];
  const rgb = /^rgba?\(\s*(\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\s*\)$/i.exec(colour);
  if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3]), rgb[4] === undefined ? 1 : Number(rgb[4])];
  throw new Error(`Not a colour this helper reads: ${colour}`);
};

const linear = (value: number) => {
  const c = value / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};

const luminanceOf = ([r, g, b]: Rgba): number =>
  0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);

const contrastRatio = (foreground: string, background: string): number => {
  const ground = parse(background);
  if (ground[3] !== 1) throw new Error(`The background must be opaque: ${background}`);
  const [r, g, b, a] = parse(foreground);
  const painted: Rgba = [
    r * a + ground[0] * (1 - a),
    g * a + ground[1] * (1 - a),
    b * a + ground[2] * (1 - a),
    1,
  ];
  const [hi, lo] = [luminanceOf(painted), luminanceOf(ground)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

const FACES: SwitchboardFace[] = ['bench', 'arcade'];

// The pin: boracaya-valet src/shared/domain/switchboardTokens.ts at 33945b2,
// value for value, the table both consoles wore before it moved here. A change
// here is a deliberate diff that reaches Valet and Mission Control alike.
describe('the Switchboard tokens, exactly as the consoles wear them', () => {
  it('carries the Bench (light) face', () => {
    expect(SWITCHBOARD_TOKENS.bench).toStrictEqual({
      bg: '#e7e4db',
      panel: '#f8f7f1',
      ink: '#20211e',
      muted: '#64655e',
      accent: '#f04e23',
      accentInk: '#161616',
      accentText: '#bc310d',
      rule: '#d3d0c4',
      good: '#167347',
      warn: '#865d11',
      danger: '#b3261e',
      dangerInk: '#ffffff',
      lcd: '#14211b',
      lcdInk: '#6fe3a5',
      edge: '#20211e',
      shadow: '#20211e',
      scheme: 'light',
    });
  });

  it('carries the Arcade (dark) face', () => {
    expect(SWITCHBOARD_TOKENS.arcade).toStrictEqual({
      bg: '#0d1018',
      panel: '#171c28',
      ink: '#e9edf8',
      muted: '#8b93a8',
      accent: '#ffd23f',
      accentInk: '#161616',
      accentText: '#ffd23f',
      rule: '#252b3a',
      good: '#42e08c',
      warn: '#ff9f43',
      danger: '#ff8a7a',
      dangerInk: '#161616',
      lcd: '#0f1722',
      lcdInk: '#7dd8ff',
      edge: '#3b4360',
      shadow: '#05070d',
      scheme: 'dark',
    });
  });

  it('has the two faces and no others', () => {
    expect(Object.keys(SWITCHBOARD_TOKENS).sort()).toEqual(['arcade', 'bench']);
  });

  it('carries the three system type stacks, no web fonts', () => {
    expect(SWITCHBOARD_DISPLAY_FONT).toBe(
      "ui-rounded,'SF Pro Rounded','Hiragino Maru Gothic ProN','Varela Round','Nunito',system-ui,sans-serif",
    );
    expect(SWITCHBOARD_BODY_FONT).toBe("ui-rounded,'SF Pro Rounded',system-ui,sans-serif");
    expect(SWITCHBOARD_DATA_FONT).toBe("ui-monospace,'SF Mono',Menlo,Consolas,monospace");
  });
});

// Every colour a console sets as TYPE, on both grounds it sits on (a module's
// panel, the page's bg), at the 4.5:1 normal-text bar. Measured rather than
// eyeballed, so a token edit that breaks one fails this package's build before
// it can reach either console.
describe('WCAG contrast of the tokens, measured on both faces', () => {
  const TYPE_TOKENS = ['ink', 'muted', 'accentText', 'good', 'warn', 'danger'] as const;

  it.each(FACES)('holds 4.5:1 for every type colour on the %s panel and bg', (face) => {
    const tokens = SWITCHBOARD_TOKENS[face];
    for (const name of TYPE_TOKENS) {
      expect(contrastRatio(tokens[name], tokens.panel), `${name} on panel`).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(tokens[name], tokens.bg), `${name} on bg`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it.each(FACES)('holds 4.5:1 for the labels on the filled accent and danger fills, %s face', (face) => {
    const tokens = SWITCHBOARD_TOKENS[face];
    // The active rail item, the primary button, the brand mark.
    expect(contrastRatio(tokens.accentInk, tokens.accent), 'accentInk on accent').toBeGreaterThanOrEqual(4.5);
    // Every filled destructive control.
    expect(contrastRatio(tokens.dangerInk, tokens.danger), 'dangerInk on danger').toBeGreaterThanOrEqual(4.5);
  });

  it('measures the way WCAG does', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrastRatio('#ffffff', '#ffffff')).toBe(1);
    expect(contrastRatio('rgb(0, 0, 0)', 'rgba(255, 255, 255, 1)')).toBeCloseTo(21, 5);
    expect(contrastRatio('#fff', '#000000')).toBeCloseTo(21, 5);
    // A translucent label is painted over its ground first: 50% black on
    // white is mid grey, not black.
    expect(contrastRatio('rgba(0, 0, 0, 0.5)', '#ffffff')).toBeCloseTo(contrastRatio('#808080', '#ffffff'), 1);
    expect(() => contrastRatio('#000000', 'rgba(255, 255, 255, 0.5)')).toThrow('must be opaque');
    expect(() => contrastRatio('white', '#ffffff')).toThrow('Not a colour this helper reads');
  });

  // The figures the Valet history above the table quotes, so its prose and
  // its values cannot drift apart unnoticed.
  it('matches the ratios the token history records for danger', () => {
    expect(contrastRatio(SWITCHBOARD_TOKENS.bench.danger, SWITCHBOARD_TOKENS.bench.panel)).toBeCloseTo(6.09, 2);
    expect(contrastRatio(SWITCHBOARD_TOKENS.bench.danger, SWITCHBOARD_TOKENS.bench.bg)).toBeCloseTo(5.14, 2);
    expect(contrastRatio(SWITCHBOARD_TOKENS.arcade.danger, SWITCHBOARD_TOKENS.arcade.panel)).toBeCloseTo(7.43, 2);
    expect(contrastRatio(SWITCHBOARD_TOKENS.arcade.danger, SWITCHBOARD_TOKENS.arcade.bg)).toBeCloseTo(8.30, 2);
    expect(contrastRatio(SWITCHBOARD_TOKENS.bench.dangerInk, SWITCHBOARD_TOKENS.bench.danger)).toBeCloseTo(6.54, 2);
    expect(contrastRatio(SWITCHBOARD_TOKENS.arcade.dangerInk, SWITCHBOARD_TOKENS.arcade.danger)).toBeCloseTo(7.90, 2);
  });
});
