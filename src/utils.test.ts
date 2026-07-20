import { describe, expect, it } from 'vitest';
import { ArrayUtils, ColorUtils, DateUtils, NumberUtils, StringUtils } from './utils';

describe('StringUtils', () => {
  it('isEmpty: null, undefined, empty, whitespace-only are empty', () => {
    expect(StringUtils.isEmpty(null)).toBe(true);
    expect(StringUtils.isEmpty(undefined)).toBe(true);
    expect(StringUtils.isEmpty('')).toBe(true);
    expect(StringUtils.isEmpty('   ')).toBe(true);
    expect(StringUtils.isEmpty(' x ')).toBe(false);
  });

  it('isNotEmpty mirrors isEmpty', () => {
    expect(StringUtils.isNotEmpty('x')).toBe(true);
    expect(StringUtils.isNotEmpty('  ')).toBe(false);
  });

  it('isEmailShaped: shape only, trims, rejects spaces and missing tld', () => {
    expect(StringUtils.isEmailShaped(' a@b.co ')).toBe(true);
    expect(StringUtils.isEmailShaped('a@b')).toBe(false);
    expect(StringUtils.isEmailShaped('a b@c.d')).toBe(false);
    expect(StringUtils.isEmailShaped(null)).toBe(false);
  });

  it('capitalize: first char only, empty-safe', () => {
    expect(StringUtils.capitalize('story')).toBe('Story');
    expect(StringUtils.capitalize('our story')).toBe('Our story');
    expect(StringUtils.capitalize('')).toBe('');
  });

  it('initialsOf: two word-initials by default, ? fallback', () => {
    expect(StringUtils.initialsOf('Ada Lovelace')).toBe('AL');
    expect(StringUtils.initialsOf('  ada   byron   lovelace ')).toBe('AB');
    expect(StringUtils.initialsOf('ada byron lovelace', 3)).toBe('ABL');
    expect(StringUtils.initialsOf('')).toBe('?');
    expect(StringUtils.initialsOf('   ')).toBe('?');
  });

  it('titleCase: kebab slug to Title Case', () => {
    expect(StringUtils.titleCase('our-story')).toBe('Our Story');
    expect(StringUtils.titleCase('faq')).toBe('Faq');
  });

  it('lastGrapheme: whole trailing emoji survives, trims input, empty-safe', () => {
    expect(StringUtils.lastGrapheme('abc')).toBe('c');
    expect(StringUtils.lastGrapheme('go 👍🏽 ')).toBe('👍🏽');
    expect(StringUtils.lastGrapheme('family 👨‍👩‍👧‍👦')).toBe('👨‍👩‍👧‍👦');
    expect(StringUtils.lastGrapheme('   ')).toBe('');
  });
});

describe('ArrayUtils', () => {
  it('isEmpty / isNotEmpty: null-safe', () => {
    expect(ArrayUtils.isEmpty(null)).toBe(true);
    expect(ArrayUtils.isEmpty(undefined)).toBe(true);
    expect(ArrayUtils.isEmpty([])).toBe(true);
    expect(ArrayUtils.isEmpty([0])).toBe(false);
    expect(ArrayUtils.isNotEmpty([1])).toBe(true);
  });

  it('unique: order-preserving dedup', () => {
    expect(ArrayUtils.unique(['b', 'a', 'b', 'c', 'a'])).toEqual(['b', 'a', 'c']);
  });

  it('compactJoin: drops falsy parts', () => {
    expect(ArrayUtils.compactJoin(['a', null, 'b', undefined, false, ''], ' · ')).toBe('a · b');
    expect(ArrayUtils.compactJoin([null, undefined], ', ')).toBe('');
  });
});

describe('NumberUtils', () => {
  it('clamp and clamp01', () => {
    expect(NumberUtils.clamp(5, 0, 3)).toBe(3);
    expect(NumberUtils.clamp(-1, 0, 3)).toBe(0);
    expect(NumberUtils.clamp(2, 0, 3)).toBe(2);
    expect(NumberUtils.clamp01(1.5)).toBe(1);
    expect(NumberUtils.clamp01(-0.5)).toBe(0);
  });

  it('pct: whole-percent label', () => {
    expect(NumberUtils.pct(0.427)).toBe('43%');
    expect(NumberUtils.pct(0)).toBe('0%');
    expect(NumberUtils.pct(1)).toBe('100%');
  });
});

describe('DateUtils', () => {
  it('calendarDate: UTC-pinned calendar date, en-US long by default', () => {
    expect(DateUtils.calendarDate('2026-06-05')).toBe('June 5, 2026');
    // A viewer west of UTC must not see June 4 — the zone pin is the point.
    expect(DateUtils.calendarDate('2026-06-05T00:00:00.000Z')).toBe('June 5, 2026');
  });

  it('calendarDate: options + locale variants (StampDesigner shape)', () => {
    expect(
      DateUtils.calendarDate('2026-06-05', { month: 'short', day: 'numeric', year: 'numeric' }, undefined),
    ).toMatch(/Jun/);
  });

  it('calendarDate: null for missing or invalid input', () => {
    expect(DateUtils.calendarDate(undefined)).toBeNull();
    expect(DateUtils.calendarDate('')).toBeNull();
    expect(DateUtils.calendarDate('not-a-date')).toBeNull();
  });

  it('daysUntil: whole UTC calendar days, negative when passed', () => {
    const now = new Date('2026-07-19T15:00:00.000Z');
    expect(DateUtils.daysUntil('2026-07-21', now)).toBe(2);
    expect(DateUtils.daysUntil('2026-07-19', now)).toBe(0);
    expect(DateUtils.daysUntil('2026-07-17T09:00:00.000Z', now)).toBe(-2);
  });

  it('relativeTime: buckets, seconds-epoch normalization, skew clamp', () => {
    const now = Date.parse('2026-07-19T12:00:00.000Z');
    expect(DateUtils.relativeTime(now - 30_000, now)).toBe('just now');
    expect(DateUtils.relativeTime(now - 5 * 60_000, now)).toBe('5m ago');
    expect(DateUtils.relativeTime(now - 3 * 3_600_000, now)).toBe('3h ago');
    expect(DateUtils.relativeTime(now - 2 * 86_400_000, now)).toBe('2d ago');
    expect(DateUtils.relativeTime(now - 21 * 86_400_000, now)).toBe('3w ago');
    // Stored-in-seconds epochs are normalized.
    expect(DateUtils.relativeTime((now - 5 * 60_000) / 1000, now)).toBe('5m ago');
    // A timestamp slightly in the future (clock skew) is "just now", never negative.
    expect(DateUtils.relativeTime(now + 60_000, now)).toBe('just now');
  });
});

describe('ColorUtils', () => {
  const PALETTE = ['#C2755B', '#7C9A77', '#D8A24A', '#9DB8C9', '#B58DB6'] as const;

  it('hashCode: stable, unsigned, matches the 31-multiplier family', () => {
    expect(ColorUtils.hashCode('Ada')).toBe(ColorUtils.hashCode('Ada'));
    expect(ColorUtils.hashCode('Ada')).toBeGreaterThanOrEqual(0);
    // Pinned value so the assignment family can never drift silently — a
    // changed hash re-tints every avatar in both apps.
    expect(ColorUtils.hashCode('Ada')).toBe(65662);
  });

  it('tintFor: deterministic palette pick', () => {
    expect(ColorUtils.tintFor('Ada', PALETTE)).toBe(PALETTE[65662 % PALETTE.length]);
    expect(ColorUtils.tintFor('Ada', PALETTE)).toBe(ColorUtils.tintFor('Ada', PALETTE));
  });
});
