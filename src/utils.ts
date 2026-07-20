// Basic cross-app utilities (cdk#1157): the micro-patterns both frontends kept
// re-implementing (trim/emptiness checks, capitalize/initials, dedup/joins,
// clamp/percentage, calendar-date + relative-time formatting, hash→tint).
// Deliberately minimal — a helper earns a slot here only when at least two
// call sites (ideally two repos) repeated it. App-specific COPY (countdown
// phrases, feed tails) stays app-side: e2e narrative specs pin rendered text.
// Node-safe like data.ts — no browser or React imports.

/** String helpers. Superset of Shore's original local StringUtils (#881). */
export const StringUtils = {
  /** True for null/undefined/whitespace-only. */
  isEmpty: (str: string | null | undefined): boolean =>
    str === null || str === undefined || str.trim() === '',
  isNotEmpty: (str: string | null | undefined): boolean => !StringUtils.isEmpty(str),
  /** Shape check only (#881): something@something.tld. The server stays the
   *  boundary — this exists so a guest can't finish an RSVP with an email
   *  the confirmation can never reach. */
  isEmailShaped: (str: string | null | undefined): boolean =>
    typeof str === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(str.trim()),
  /** First character uppercased, rest untouched ('' stays ''). */
  capitalize: (str: string): string => str.charAt(0).toUpperCase() + str.slice(1),
  /** Up to `max` word-initials, uppercased — '?' when nothing usable. */
  initialsOf: (name: string, max = 2): string =>
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, max)
      .map((w) => w[0]?.toUpperCase() ?? '')
      .join('') || '?',
  /** kebab-or-plain slug → Title Case ('our-story' → 'Our Story'). */
  titleCase: (slug: string): string =>
    slug
      .split('-')
      .map((w) => StringUtils.capitalize(w))
      .join(' '),
  /** The last whole grapheme the user typed/pasted. Grapheme-cluster aware, so
   *  a multi-codepoint emoji (variation selector, ZWJ family, skin tone) is
   *  kept intact rather than a trailing joiner/selector — `[...str]` would
   *  split those apart. No Segmenter: returns the whole trimmed input rather
   *  than risk splitting an emoji. */
  lastGrapheme: (raw: string): string => {
    const s = raw.trim();
    if (!s) return '';
    // Segmenter is cast-accessed: this package's TS lib predates its typings.
    const Segmenter = (Intl as unknown as {
      Segmenter?: new () => { segment: (input: string) => Iterable<{ segment: string }> };
    }).Segmenter;
    if (Segmenter) {
      const segments = [...new Segmenter().segment(s)];
      return segments.length ? segments[segments.length - 1].segment : s;
    }
    return s;
  },
};

/** Array helpers. `clean`/`asArray` (data.ts) remain the coercion primitives. */
export const ArrayUtils = {
  isEmpty: (items: readonly unknown[] | null | undefined): boolean =>
    !items || items.length === 0,
  isNotEmpty: (items: readonly unknown[] | null | undefined): boolean =>
    !ArrayUtils.isEmpty(items),
  /** Order-preserving dedup. */
  unique: <T>(items: readonly T[]): T[] => Array.from(new Set(items)),
  /** Drop falsy parts, join the rest — the `filter(Boolean).join(sep)` idiom. */
  compactJoin: (
    parts: ReadonlyArray<string | null | undefined | false>,
    separator: string,
  ): string => parts.filter(Boolean).join(separator),
};

export const NumberUtils = {
  clamp: (n: number, min: number, max: number): number => Math.min(max, Math.max(min, n)),
  clamp01: (n: number): number => NumberUtils.clamp(n, 0, 1),
  /** Ratio → whole-percent label: 0.427 → '43%'. */
  pct: (ratio: number): string => `${Math.round(ratio * 100)}%`,
};

export const DateUtils = {
  /**
   * Render the CALENDAR date an ISO config value stores (values are
   * midnight-UTC): the zone is pinned so viewers west of UTC don't see the
   * previous day. null for missing/invalid input. Defaults match the admin
   * events list ('June 5, 2026'); pass options/locale for other shapes
   * (e.g. { month: 'short' } with locale undefined → 'Jun 5, 2026').
   */
  calendarDate: (
    iso?: string,
    options: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'long', day: 'numeric' },
    locale: string | undefined = 'en-US',
  ): string | null => {
    if (!iso) return null;
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return null;
    return new Intl.DateTimeFormat(locale, { ...options, timeZone: 'UTC' }).format(d);
  },
  /** Whole days from today (UTC) to the ISO date; negative = passed. */
  daysUntil: (iso: string, now: Date = new Date()): number => {
    const event = Date.parse(`${iso.slice(0, 10)}T00:00:00.000Z`);
    const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    return Math.round((event - today) / 86_400_000);
  },
  /**
   * Concise relative time ("just now", "5m ago", "3h ago", "2d ago", "3w ago").
   * Accepts second- OR millisecond-epochs (survey/RSVP timestamps are stored
   * in seconds); clock skew clamps to "just now", never a negative age.
   */
  relativeTime: (epoch: number, now: number = Date.now()): string => {
    const ms = epoch < 1e12 ? epoch * 1000 : epoch;
    const diff = Math.max(0, now - ms);
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;
    return `${Math.floor(days / 7)}w ago`;
  },
};

export const ColorUtils = {
  /** Stable 31-multiplier string hash (unsigned). The tint-assignment family
   *  used across Valet — keep using it wherever an entity's colour must not
   *  re-randomise between renders or sessions. */
  hashCode: (seed: string): number => {
    let h = 0;
    for (let i = 0; i < seed.length; i += 1) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
    return h;
  },
  /** Deterministic palette pick for a seed (avatar/page tints). */
  tintFor: (seed: string, palette: readonly string[]): string =>
    palette[ColorUtils.hashCode(seed) % palette.length],
};
