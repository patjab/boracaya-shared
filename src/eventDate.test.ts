import { describe, expect, it } from 'vitest';
import {
  compareEventDates,
  daysUntilEventDate,
  eventCalendarWithLegacyFallback,
  eventDayWindow,
  formatEventDate,
  isEventDate,
  isEventTimeZone,
} from './eventDate';

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
});

