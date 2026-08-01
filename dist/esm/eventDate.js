const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
export const isEventDate = (value) => {
    if (typeof value !== 'string')
        return false;
    const match = DATE_PATTERN.exec(value);
    if (!match)
        return false;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const utc = new Date(Date.UTC(year, month - 1, day));
    return utc.getUTCFullYear() === year
        && utc.getUTCMonth() === month - 1
        && utc.getUTCDate() === day;
};
const canonicalTimeZones = () => {
    const supportedValuesOf = Intl.supportedValuesOf;
    return supportedValuesOf ? supportedValuesOf('timeZone') : null;
};
/** Canonical IANA region identifier, with UTC as the explicit safe fallback. */
export const isEventTimeZone = (value) => {
    if (typeof value !== 'string' || !value || value !== value.trim())
        return false;
    if (value === 'UTC')
        return true;
    if (!value.includes('/') || /^Etc\/GMT[+-]/.test(value))
        return false;
    const supported = canonicalTimeZones();
    if (supported)
        return supported.includes(value);
    try {
        return new Intl.DateTimeFormat('en-US', { timeZone: value }).resolvedOptions().timeZone === value;
    }
    catch (_a) {
        return false;
    }
};
export const supportedEventTimeZones = () => {
    var _a;
    return [
        'UTC',
        ...((_a = canonicalTimeZones()) !== null && _a !== void 0 ? _a : []),
    ];
};
const partsOf = (date) => {
    const match = DATE_PATTERN.exec(date);
    if (!match || !isEventDate(date))
        throw new RangeError(`Invalid event date: ${date}`);
    return [Number(match[1]), Number(match[2]), Number(match[3])];
};
const dateKeyAt = (instantMs, timeZone) => {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).formatToParts(new Date(instantMs));
    const value = (type) => { var _a, _b; return (_b = (_a = parts.find((part) => part.type === type)) === null || _a === void 0 ? void 0 : _a.value) !== null && _b !== void 0 ? _b : ''; };
    return `${value('year')}-${value('month')}-${value('day')}`;
};
const addCalendarDays = (date, days) => {
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
const startOfEventDateMs = (eventDate, eventTimeZone) => {
    if (!isEventTimeZone(eventTimeZone)) {
        throw new RangeError(`Invalid event timezone: ${eventTimeZone}`);
    }
    const [year, month, day] = partsOf(eventDate);
    let low = Date.UTC(year, month - 1, day) - 36 * 60 * 60 * 1000;
    let high = Date.UTC(year, month - 1, day) + 36 * 60 * 60 * 1000;
    while (low < high) {
        const middle = Math.floor((low + high) / 2);
        if (dateKeyAt(middle, eventTimeZone) < eventDate)
            low = middle + 1;
        else
            high = middle;
    }
    if (dateKeyAt(low, eventTimeZone) !== eventDate) {
        throw new RangeError(`Event date does not exist in timezone: ${eventDate} ${eventTimeZone}`);
    }
    return low;
};
export const eventDayWindow = (eventDate, eventTimeZone) => {
    const startsAt = startOfEventDateMs(eventDate, eventTimeZone);
    const nextStartsAt = startOfEventDateMs(addCalendarDays(eventDate, 1), eventTimeZone);
    return {
        startsAtUTC: new Date(startsAt).toISOString(),
        endsAtUTC: new Date(nextStartsAt - 1).toISOString(),
    };
};
export const formatEventDate = (eventDate, options = {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
}, locale = 'en-US') => {
    if (!isEventDate(eventDate))
        return null;
    const [year, month, day] = partsOf(eventDate);
    return new Intl.DateTimeFormat(locale, { ...options, timeZone: 'UTC' })
        .format(new Date(Date.UTC(year, month - 1, day, 12)));
};
export const eventDateFromLegacyISO = (legacy) => {
    const candidate = legacy === null || legacy === void 0 ? void 0 : legacy.slice(0, 10);
    return isEventDate(candidate) ? candidate : null;
};
export const eventCalendarWithLegacyFallback = (value) => {
    const eventDate = isEventDate(value.eventDate)
        ? value.eventDate
        : eventDateFromLegacyISO(value.eventDateISOString);
    if (!eventDate)
        return null;
    return {
        eventDate,
        eventTimeZone: isEventTimeZone(value.eventTimeZone) ? value.eventTimeZone : 'UTC',
    };
};
export const eventDateInTimeZone = (instant, timeZone) => {
    if (!isEventTimeZone(timeZone))
        throw new RangeError(`Invalid event timezone: ${timeZone}`);
    return dateKeyAt(instant.getTime(), timeZone);
};
export const compareEventDates = (left, right) => {
    if (!isEventDate(left) || !isEventDate(right))
        throw new RangeError('Invalid event date');
    return left === right ? 0 : left < right ? -1 : 1;
};
export const daysUntilEventDate = (eventDate, eventTimeZone, now = new Date()) => {
    const today = eventDateInTimeZone(now, eventTimeZone);
    const [eventYear, eventMonth, eventDay] = partsOf(eventDate);
    const [todayYear, todayMonth, todayDay] = partsOf(today);
    return Math.round((Date.UTC(eventYear, eventMonth - 1, eventDay)
        - Date.UTC(todayYear, todayMonth - 1, todayDay)) / 86400000);
};
