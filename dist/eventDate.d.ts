/** A local event calendar fact. It is not an instant and has no start time. */
export interface EventCalendar {
    eventDate: string;
    eventTimeZone: string;
}
export interface EventDayWindow {
    startsAtUTC: string;
    endsAtUTC: string;
}
export declare const isEventDate: (value: unknown) => value is string;
/** Canonical IANA region identifier, with UTC as the explicit safe fallback. */
export declare const isEventTimeZone: (value: unknown) => value is string;
/**
 * The zone.tab spelling of a zone the engine reports under ICU's legacy id
 * (Chromium's `Asia/Calcutta` -> `Asia/Kolkata`); any other value unchanged.
 * Use it on a detected browser zone before offering or saving it.
 */
export declare const canonicalEventTimeZone: (value: string) => string;
/** UTC first, then the engine's zones in their zone.tab spelling, sorted. */
export declare const supportedEventTimeZones: () => string[];
export declare const eventDayWindow: (eventDate: string, eventTimeZone: string) => EventDayWindow;
export declare const formatEventDate: (eventDate: string, options?: Intl.DateTimeFormatOptions, locale?: string | undefined) => string | null;
export declare const eventDateFromLegacyISO: (legacy?: string) => string | null;
export declare const eventCalendarWithLegacyFallback: (value: Partial<EventCalendar> & {
    eventDateISOString?: string;
}) => EventCalendar | null;
export declare const eventDateInTimeZone: (instant: Date, timeZone: string) => string;
export declare const compareEventDates: (left: string, right: string) => -1 | 0 | 1;
export declare const daysUntilEventDate: (eventDate: string, eventTimeZone: string, now?: Date) => number;
