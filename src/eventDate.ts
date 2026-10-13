/** A local event calendar fact. It is not an instant and has no start time. */
export interface EventCalendar {
  eventDate: string;
  eventTimeZone: string;
}

export interface EventDayWindow {
  startsAtUTC: string;
  endsAtUTC: string;
}

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

export const isEventDate = (value: unknown): value is string => {
  if (typeof value !== 'string') return false;
  const match = DATE_PATTERN.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const utc = new Date(Date.UTC(year, month - 1, day));
  return utc.getUTCFullYear() === year
    && utc.getUTCMonth() === month - 1
    && utc.getUTCDate() === day;
};

const canonicalTimeZones = (): readonly string[] | null => {
  const supportedValuesOf = (Intl as typeof Intl & {
    supportedValuesOf?: (key: 'timeZone') => string[];
  }).supportedValuesOf;
  return supportedValuesOf ? supportedValuesOf('timeZone') : null;
};

/**
 * zone.tab names that V8 (Chrome, Edge, Android WebView, Node) reports under
 * ICU's legacy ids: `Intl.supportedValuesOf('timeZone')` lists only the legacy
 * spelling (Asia/Calcutta) and `resolvedOptions().timeZone` echoes it back.
 * The backend accepts only zone.tab names, so without this list a stored
 * `Asia/Kolkata` failed `isEventTimeZone` in Chromium and the event silently
 * ran on UTC days (shore#506). The legacy ids are not listed: each engine says
 * which spelling it uses, so the reverse map is read from it.
 */
const ENGINE_RENAMED_ZONES = [
  'Africa/Asmara',
  'America/Argentina/Buenos_Aires',
  'America/Argentina/Catamarca',
  'America/Argentina/Cordoba',
  'America/Argentina/Jujuy',
  'America/Argentina/Mendoza',
  'America/Atikokan',
  'America/Indiana/Indianapolis',
  'America/Kentucky/Louisville',
  'America/Nuuk',
  'Asia/Ho_Chi_Minh',
  'Asia/Kathmandu',
  'Asia/Kolkata',
  'Asia/Yangon',
  'Atlantic/Faroe',
  'Europe/Kyiv',
  'Pacific/Chuuk',
  'Pacific/Kanton',
  'Pacific/Pohnpei',
];

/** The engine's own spelling of a zone, or null when it cannot format it. */
const engineZoneId = (timeZone: string): string | null => {
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone }).resolvedOptions().timeZone;
  } catch {
    return null;
  }
};

/** Canonical IANA region identifier, with UTC as the explicit safe fallback. */
export const isEventTimeZone = (value: unknown): value is string => {
  if (typeof value !== 'string' || !value || value !== value.trim()) return false;
  if (value === 'UTC') return true;
  if (!value.includes('/') || /^Etc\/GMT[+-]/.test(value)) return false;
  // A zone.tab name the engine lists under a legacy id is still canonical.
  if (ENGINE_RENAMED_ZONES.includes(value)) return engineZoneId(value) !== null;
  const supported = canonicalTimeZones();
  if (supported) return supported.includes(value);
  return engineZoneId(value) === value;
};

let legacyZoneIds: Map<string, string> | undefined;

/**
 * The zone.tab spelling of a zone the engine reports under ICU's legacy id
 * (Chromium's `Asia/Calcutta` -> `Asia/Kolkata`); any other value unchanged.
 * Use it on a detected browser zone before offering or saving it.
 */
export const canonicalEventTimeZone = (value: string): string => {
  if (!legacyZoneIds) {
    legacyZoneIds = new Map();
    for (const zone of ENGINE_RENAMED_ZONES) {
      const id = engineZoneId(zone);
      if (id && id !== zone) legacyZoneIds.set(id, zone);
    }
  }
  return legacyZoneIds.get(value) ?? value;
};

/** UTC first, then the engine's zones in their zone.tab spelling, sorted. */
export const supportedEventTimeZones = (): string[] => [
  'UTC',
  ...[...new Set((canonicalTimeZones() ?? []).map(canonicalEventTimeZone))].sort(),
];

const partsOf = (date: string): [number, number, number] => {
  const match = DATE_PATTERN.exec(date);
  if (!match || !isEventDate(date)) throw new RangeError(`Invalid event date: ${date}`);
  return [Number(match[1]), Number(match[2]), Number(match[3])];
};

const dateKeyAt = (instantMs: number, timeZone: string): string => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(instantMs));
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? '';
  return `${value('year')}-${value('month')}-${value('day')}`;
};

const addCalendarDays = (date: string, days: number): string => {
  const [year, month, day] = partsOf(date);
  const next = new Date(Date.UTC(year, month - 1, day + days));
  return [
    String(next.getUTCFullYear()).padStart(4, '0'),
    String(next.getUTCMonth() + 1).padStart(2, '0'),
    String(next.getUTCDate()).padStart(2, '0'),
  ].join('-');
};

/**
 * Earliest actual instant whose local calendar date is `eventDate`. Binary
 * search avoids assuming a fixed offset, a 24-hour day, or even that local
 * midnight exists on a timezone-transition date.
 */
const startOfEventDateMs = (eventDate: string, eventTimeZone: string): number => {
  if (!isEventTimeZone(eventTimeZone)) {
    throw new RangeError(`Invalid event timezone: ${eventTimeZone}`);
  }
  const [year, month, day] = partsOf(eventDate);
  let low = Date.UTC(year, month - 1, day) - 36 * 60 * 60 * 1000;
  let high = Date.UTC(year, month - 1, day) + 36 * 60 * 60 * 1000;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (dateKeyAt(middle, eventTimeZone) < eventDate) low = middle + 1;
    else high = middle;
  }
  if (dateKeyAt(low, eventTimeZone) !== eventDate) {
    throw new RangeError(`Event date does not exist in timezone: ${eventDate} ${eventTimeZone}`);
  }
  return low;
};

export const eventDayWindow = (
  eventDate: string,
  eventTimeZone: string,
): EventDayWindow => {
  const startsAt = startOfEventDateMs(eventDate, eventTimeZone);
  const nextStartsAt = startOfEventDateMs(addCalendarDays(eventDate, 1), eventTimeZone);
  return {
    startsAtUTC: new Date(startsAt).toISOString(),
    endsAtUTC: new Date(nextStartsAt - 1).toISOString(),
  };
};

export const formatEventDate = (
  eventDate: string,
  options: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  },
  locale: string | undefined = 'en-US',
): string | null => {
  if (!isEventDate(eventDate)) return null;
  const [year, month, day] = partsOf(eventDate);
  return new Intl.DateTimeFormat(locale, { ...options, timeZone: 'UTC' })
    .format(new Date(Date.UTC(year, month - 1, day, 12)));
};

export const eventDateFromLegacyISO = (legacy?: string): string | null => {
  const candidate = legacy?.slice(0, 10);
  return isEventDate(candidate) ? candidate : null;
};

export const eventCalendarWithLegacyFallback = (
  value: Partial<EventCalendar> & { eventDateISOString?: string },
): EventCalendar | null => {
  const eventDate = isEventDate(value.eventDate)
    ? value.eventDate
    : eventDateFromLegacyISO(value.eventDateISOString);
  if (!eventDate) return null;
  return {
    eventDate,
    eventTimeZone: isEventTimeZone(value.eventTimeZone) ? value.eventTimeZone : 'UTC',
  };
};

export const eventDateInTimeZone = (instant: Date, timeZone: string): string => {
  if (!isEventTimeZone(timeZone)) throw new RangeError(`Invalid event timezone: ${timeZone}`);
  return dateKeyAt(instant.getTime(), timeZone);
};

export const compareEventDates = (left: string, right: string): -1 | 0 | 1 => {
  if (!isEventDate(left) || !isEventDate(right)) throw new RangeError('Invalid event date');
  return left === right ? 0 : left < right ? -1 : 1;
};

export const daysUntilEventDate = (
  eventDate: string,
  eventTimeZone: string,
  now: Date = new Date(),
): number => {
  const today = eventDateInTimeZone(now, eventTimeZone);
  const [eventYear, eventMonth, eventDay] = partsOf(eventDate);
  const [todayYear, todayMonth, todayDay] = partsOf(today);
  return Math.round((
    Date.UTC(eventYear, eventMonth - 1, eventDay)
    - Date.UTC(todayYear, todayMonth - 1, todayDay)
  ) / 86_400_000);
};
