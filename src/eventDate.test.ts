import { describe, expect, it } from 'vitest';
import {
  compareEventDates,
  daysUntilEventDate,
  eventCalendarWithLegacyFallback,
  eventDayWindow,
  formatEventDate,
  isEventDate,
  canonicalEventTimeZone,
  isEventTimeZone,
  supportedEventTimeZones,
} from './eventDate';

// zone.tab names V8 lists under ICU legacy ids (shore#506), with that legacy id.
const V8_RENAMED_ZONES: Array<[string, string]> = [
  ['America/Argentina/Buenos_Aires', 'America/Buenos_Aires'],
  ['America/Argentina/Cordoba', 'America/Cordoba'],
  ['America/Argentina/Jujuy', 'America/Jujuy'],
  ['America/Argentina/Catamarca', 'America/Catamarca'],
  ['America/Argentina/Mendoza', 'America/Mendoza'],
  ['America/Atikokan', 'America/Coral_Harbour'],
  ['Africa/Asmara', 'Africa/Asmera'],
  ['Pacific/Chuuk', 'Pacific/Truk'],
  ['Pacific/Pohnpei', 'Pacific/Ponape'],
  ['Atlantic/Faroe', 'Atlantic/Faeroe'],
  ['America/Nuuk', 'America/Godthab'],
  ['Asia/Kolkata', 'Asia/Calcutta'],
  ['Pacific/Kanton', 'Pacific/Enderbury'],
  ['Asia/Yangon', 'Asia/Rangoon'],
  ['Asia/Kathmandu', 'Asia/Katmandu'],
  ['Europe/Kyiv', 'Europe/Kiev'],
  ['America/Kentucky/Louisville', 'America/Louisville'],
  ['America/Indiana/Indianapolis', 'America/Indianapolis'],
  ['Asia/Ho_Chi_Minh', 'Asia/Saigon'],
];

describe('event calendar dates', () => {
  it('strictly validates Gregorian YYYY-MM-DD without rollover', () => {
    expect(isEventDate('2028-02-29')).toBe(true);
    expect(isEventDate('2027-02-29')).toBe(false);
    expect(isEventDate('2027-04-31')).toBe(false);
    expect(isEventDate('2027-2-03')).toBe(false);
    expect(isEventDate('2027-02-03T00:00:00Z')).toBe(false);
  });

  it('validates canonical IANA zones while rejecting offsets and aliases', () => {
    expect(isEventTimeZone('UTC')).toBe(true);
    expect(isEventTimeZone('America/New_York')).toBe(true);
    expect(isEventTimeZone('Pacific/Kiritimati')).toBe(true);
    expect(isEventTimeZone('America/Adak')).toBe(true);
    expect(isEventTimeZone('-04:00')).toBe(false);
    expect(isEventTimeZone('Etc/GMT+4')).toBe(false);
    expect(isEventTimeZone('US/Eastern')).toBe(false);
    expect(isEventTimeZone('Mars/Olympus')).toBe(false);
  });

  it('formats a date-only value identically without a viewer-zone shift', () => {
    expect(formatEventDate('2027-01-02')).toBe('January 2, 2027');
    expect(formatEventDate('2027-01-02', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })).toBe('Jan 2, 2027');
    expect(formatEventDate('not-a-date')).toBeNull();
  });

  it('resolves spring-forward and fall-back event-day windows', () => {
    expect(eventDayWindow('2026-03-08', 'America/New_York')).toEqual({
      startsAtUTC: '2026-03-08T05:00:00.000Z',
      endsAtUTC: '2026-03-09T03:59:59.999Z',
    });
    expect(eventDayWindow('2026-11-01', 'America/New_York')).toEqual({
      startsAtUTC: '2026-11-01T04:00:00.000Z',
      endsAtUTC: '2026-11-02T04:59:59.999Z',
    });
  });

  it('handles both sides of the international date line', () => {
    expect(eventDayWindow('2027-01-02', 'Pacific/Kiritimati').startsAtUTC)
      .toBe('2027-01-01T10:00:00.000Z');
    expect(eventDayWindow('2027-01-02', 'America/Adak').startsAtUTC)
      .toBe('2027-01-02T10:00:00.000Z');
  });

  it('compares calendar values and counts against the event-zone today', () => {
    expect(compareEventDates('2027-01-01', '2027-01-02')).toBe(-1);
    expect(compareEventDates('2027-01-02', '2027-01-02')).toBe(0);
    const sameInstant = new Date('2027-01-02T09:30:00.000Z');
    expect(daysUntilEventDate('2027-01-02', 'Pacific/Kiritimati', sameInstant)).toBe(0);
    expect(daysUntilEventDate('2027-01-02', 'America/Adak', sameInstant)).toBe(1);
  });

  it('makes the legacy migration explicit and never guesses a regional zone', () => {
    expect(eventCalendarWithLegacyFallback({
      eventDateISOString: '2025-05-25T08:00:00.000Z',
    })).toEqual({
      eventDate: '2025-05-25',
      eventTimeZone: 'UTC',
    });
    expect(eventCalendarWithLegacyFallback({
      eventDate: '2027-03-14',
      eventTimeZone: 'America/New_York',
      eventDateISOString: '2025-05-25T08:00:00.000Z',
    })).toEqual({
      eventDate: '2027-03-14',
      eventTimeZone: 'America/New_York',
    });
  });

  describe('zone.tab names V8 reports under legacy ICU ids (shore#506)', () => {
    it.each(V8_RENAMED_ZONES)('keeps %s instead of falling back to UTC', (zone, legacy) => {
      expect(isEventTimeZone(zone)).toBe(true);
      expect(eventCalendarWithLegacyFallback({ eventDate: '2026-12-12', eventTimeZone: zone }))
        .toEqual({ eventDate: '2026-12-12', eventTimeZone: zone });
      expect(canonicalEventTimeZone(legacy)).toBe(zone);
      expect(canonicalEventTimeZone(zone)).toBe(zone);
    });

    it('computes the event day in the real zone, not UTC', () => {
      expect(eventDayWindow('2026-12-12', 'Asia/Kolkata')).toEqual({
        startsAtUTC: '2026-12-11T18:30:00.000Z',
        endsAtUTC: '2026-12-12T18:29:59.999Z',
      });
      expect(eventDayWindow('2026-12-12', 'America/Indiana/Indianapolis').startsAtUTC)
        .toBe('2026-12-12T05:00:00.000Z');
    });

    it('still rejects offsets, untrimmed, empty and unknown ids', () => {
      for (const bad of ['Etc/GMT+5', '', ' Asia/Kolkata', 'Asia/Kolkata ', 'Mars/Olympus', 'US/Eastern']) {
        expect(isEventTimeZone(bad)).toBe(false);
        expect(eventCalendarWithLegacyFallback({ eventDate: '2026-12-12', eventTimeZone: bad })?.eventTimeZone)
          .toBe('UTC');
      }
    });

    it('rejects a renamed zone the engine itself cannot format', () => {
      const original = Intl.DateTimeFormat;
      const stub = function (this: unknown, locale?: string, options?: Intl.DateTimeFormatOptions) {
        if (options?.timeZone === 'Asia/Kolkata') throw new RangeError('Invalid time zone');
        return new original(locale, options);
      } as unknown as typeof Intl.DateTimeFormat;
      Intl.DateTimeFormat = stub;
      try {
        expect(isEventTimeZone('Asia/Kolkata')).toBe(false);
      } finally {
        Intl.DateTimeFormat = original;
      }
    });

    it('offers the zone.tab spelling, sorted and without duplicates', () => {
      const zones = supportedEventTimeZones();
      expect(zones[0]).toBe('UTC');
      for (const [zone, legacy] of V8_RENAMED_ZONES) {
        expect(zones).toContain(zone);
        expect(zones).not.toContain(legacy);
      }
      const rest = zones.slice(1);
      expect(rest).toEqual([...new Set(rest)].sort());
    });
  });
});
