/** String helpers. Superset of Shore's original local StringUtils (#881). */
export declare const StringUtils: {
    /** True for null/undefined/whitespace-only. */
    isEmpty: (str: string | null | undefined) => boolean;
    isNotEmpty: (str: string | null | undefined) => boolean;
    /** Shape check only (#881): something@something.tld. The server stays the
     *  boundary — this exists so a guest can't finish an RSVP with an email
     *  the confirmation can never reach. */
    isEmailShaped: (str: string | null | undefined) => boolean;
    /** First character uppercased, rest untouched ('' stays ''). */
    capitalize: (str: string) => string;
    /** Up to `max` word-initials, uppercased — '?' when nothing usable. */
    initialsOf: (name: string, max?: number) => string;
    /** kebab-or-plain slug → Title Case ('our-story' → 'Our Story'). */
    titleCase: (slug: string) => string;
    /** The last whole grapheme the user typed/pasted. Grapheme-cluster aware, so
     *  a multi-codepoint emoji (variation selector, ZWJ family, skin tone) is
     *  kept intact rather than a trailing joiner/selector — `[...str]` would
     *  split those apart. No Segmenter: returns the whole trimmed input rather
     *  than risk splitting an emoji. */
    lastGrapheme: (raw: string) => string;
};
/** Array helpers. `clean`/`asArray` (data.ts) remain the coercion primitives. */
export declare const ArrayUtils: {
    isEmpty: (items: readonly unknown[] | null | undefined) => boolean;
    isNotEmpty: (items: readonly unknown[] | null | undefined) => boolean;
    /** Order-preserving dedup. */
    unique: <T>(items: readonly T[]) => T[];
    /** Drop falsy parts, join the rest — the `filter(Boolean).join(sep)` idiom. */
    compactJoin: (parts: ReadonlyArray<string | null | undefined | false>, separator: string) => string;
};
export declare const NumberUtils: {
    clamp: (n: number, min: number, max: number) => number;
    clamp01: (n: number) => number;
    /** Ratio → whole-percent label: 0.427 → '43%'. */
    pct: (ratio: number) => string;
};
export declare const DateUtils: {
    /**
     * Render the CALENDAR date an ISO config value stores (values are
     * midnight-UTC): the zone is pinned so viewers west of UTC don't see the
     * previous day. null for missing/invalid input. Defaults match the admin
     * events list ('June 5, 2026'); pass options/locale for other shapes
     * (e.g. { month: 'short' } with locale undefined → 'Jun 5, 2026').
     */
    calendarDate: (iso?: string, options?: Intl.DateTimeFormatOptions, locale?: string | undefined) => string | null;
    /** Whole days from today (UTC) to the ISO date; negative = passed. */
    daysUntil: (iso: string, now?: Date) => number;
    /**
     * Concise relative time ("just now", "5m ago", "3h ago", "2d ago", "3w ago").
     * Accepts second- OR millisecond-epochs (survey/RSVP timestamps are stored
     * in seconds); clock skew clamps to "just now", never a negative age.
     */
    relativeTime: (epoch: number, now?: number) => string;
};
export declare const ColorUtils: {
    /** Stable 31-multiplier string hash (unsigned). The tint-assignment family
     *  used across Valet — keep using it wherever an entity's colour must not
     *  re-randomise between renders or sessions. */
    hashCode: (seed: string) => number;
    /** Deterministic palette pick for a seed (avatar/page tints). */
    tintFor: (seed: string, palette: readonly string[]) => string;
};
