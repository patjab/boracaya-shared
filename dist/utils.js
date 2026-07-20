"use strict";
// Basic cross-app utilities (cdk#1157): the micro-patterns both frontends kept
// re-implementing (trim/emptiness checks, capitalize/initials, dedup/joins,
// clamp/percentage, calendar-date + relative-time formatting, hash→tint).
// Deliberately minimal — a helper earns a slot here only when at least two
// call sites (ideally two repos) repeated it. App-specific COPY (countdown
// phrases, feed tails) stays app-side: e2e narrative specs pin rendered text.
// Node-safe like data.ts — no browser or React imports.
Object.defineProperty(exports, "__esModule", { value: true });
exports.ColorUtils = exports.DateUtils = exports.NumberUtils = exports.ArrayUtils = exports.StringUtils = void 0;
/** String helpers. Superset of Shore's original local StringUtils (#881). */
exports.StringUtils = {
    /** True for null/undefined/whitespace-only. */
    isEmpty: (str) => str === null || str === undefined || str.trim() === '',
    isNotEmpty: (str) => !exports.StringUtils.isEmpty(str),
    /** Shape check only (#881): something@something.tld. The server stays the
     *  boundary — this exists so a guest can't finish an RSVP with an email
     *  the confirmation can never reach. */
    isEmailShaped: (str) => typeof str === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(str.trim()),
    /** First character uppercased, rest untouched ('' stays ''). */
    capitalize: (str) => str.charAt(0).toUpperCase() + str.slice(1),
    /** Up to `max` word-initials, uppercased — '?' when nothing usable. */
    initialsOf: (name, max = 2) => name
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, max)
        .map((w) => { var _a, _b; return (_b = (_a = w[0]) === null || _a === void 0 ? void 0 : _a.toUpperCase()) !== null && _b !== void 0 ? _b : ''; })
        .join('') || '?',
    /** kebab-or-plain slug → Title Case ('our-story' → 'Our Story'). */
    titleCase: (slug) => slug
        .split('-')
        .map((w) => exports.StringUtils.capitalize(w))
        .join(' '),
    /** The last whole grapheme the user typed/pasted. Grapheme-cluster aware, so
     *  a multi-codepoint emoji (variation selector, ZWJ family, skin tone) is
     *  kept intact rather than a trailing joiner/selector — `[...str]` would
     *  split those apart. No Segmenter: returns the whole trimmed input rather
     *  than risk splitting an emoji. */
    lastGrapheme: (raw) => {
        const s = raw.trim();
        if (!s)
            return '';
        // Segmenter is cast-accessed: this package's TS lib predates its typings.
        const Segmenter = Intl.Segmenter;
        if (Segmenter) {
            const segments = [...new Segmenter().segment(s)];
            return segments.length ? segments[segments.length - 1].segment : s;
        }
        return s;
    },
};
/** Array helpers. `clean`/`asArray` (data.ts) remain the coercion primitives. */
exports.ArrayUtils = {
    isEmpty: (items) => !items || items.length === 0,
    isNotEmpty: (items) => !exports.ArrayUtils.isEmpty(items),
    /** Order-preserving dedup. */
    unique: (items) => Array.from(new Set(items)),
    /** Drop falsy parts, join the rest — the `filter(Boolean).join(sep)` idiom. */
    compactJoin: (parts, separator) => parts.filter(Boolean).join(separator),
};
exports.NumberUtils = {
    clamp: (n, min, max) => Math.min(max, Math.max(min, n)),
    clamp01: (n) => exports.NumberUtils.clamp(n, 0, 1),
    /** Ratio → whole-percent label: 0.427 → '43%'. */
    pct: (ratio) => `${Math.round(ratio * 100)}%`,
};
exports.DateUtils = {
    /**
     * Render the CALENDAR date an ISO config value stores (values are
     * midnight-UTC): the zone is pinned so viewers west of UTC don't see the
     * previous day. null for missing/invalid input. Defaults match the admin
     * events list ('June 5, 2026'); pass options/locale for other shapes
     * (e.g. { month: 'short' } with locale undefined → 'Jun 5, 2026').
     */
    calendarDate: (iso, options = { year: 'numeric', month: 'long', day: 'numeric' }, locale = 'en-US') => {
        if (!iso)
            return null;
        const d = new Date(iso);
        if (Number.isNaN(d.getTime()))
            return null;
        return new Intl.DateTimeFormat(locale, { ...options, timeZone: 'UTC' }).format(d);
    },
    /** Whole days from today (UTC) to the ISO date; negative = passed. */
    daysUntil: (iso, now = new Date()) => {
        const event = Date.parse(`${iso.slice(0, 10)}T00:00:00.000Z`);
        const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
        return Math.round((event - today) / 86400000);
    },
    /**
     * Concise relative time ("just now", "5m ago", "3h ago", "2d ago", "3w ago").
     * Accepts second- OR millisecond-epochs (survey/RSVP timestamps are stored
     * in seconds); clock skew clamps to "just now", never a negative age.
     */
    relativeTime: (epoch, now = Date.now()) => {
        const ms = epoch < 1e12 ? epoch * 1000 : epoch;
        const diff = Math.max(0, now - ms);
        const mins = Math.floor(diff / 60000);
        if (mins < 1)
            return 'just now';
        if (mins < 60)
            return `${mins}m ago`;
        const hours = Math.floor(mins / 60);
        if (hours < 24)
            return `${hours}h ago`;
        const days = Math.floor(hours / 24);
        if (days < 7)
            return `${days}d ago`;
        return `${Math.floor(days / 7)}w ago`;
    },
};
exports.ColorUtils = {
    /** Stable 31-multiplier string hash (unsigned). The tint-assignment family
     *  used across Valet — keep using it wherever an entity's colour must not
     *  re-randomise between renders or sessions. */
    hashCode: (seed) => {
        let h = 0;
        for (let i = 0; i < seed.length; i += 1)
            h = (h * 31 + seed.charCodeAt(i)) >>> 0;
        return h;
    },
    /** Deterministic palette pick for a seed (avatar/page tints). */
    tintFor: (seed, palette) => palette[exports.ColorUtils.hashCode(seed) % palette.length],
};
