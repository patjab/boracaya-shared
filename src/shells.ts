/**
 * Shells & Styles vocabulary (cdk#739, decisions D3/D4/D14 in cdk#740) — the
 * shared half of cdk#742.
 *
 * The shell enum and style tiers mirror the config handler's validation
 * (VALID_SHELLS / STYLE_TIERS, cdk#743); the occasion→defaults map is the D4
 * table the Valet wizard's occasion quick-pick applies (D14). The guest app
 * needs none of this to RENDER (it falls back to classic on absence) — this
 * module exists so both UIs speak one vocabulary and the defaults live in
 * exactly one place.
 */

export const SHELL_KEYS = [
  'classic',
  'invitation',
  'board',
  'poster',
  'itinerary',
  'program',
  // The full-website grammar as an explicit pick (cdk#776 D25): same chrome
  // classic wraps, but chosen — classic stays the frozen absence-fallback.
  'site',
] as const;
export type ShellKey = (typeof SHELL_KEYS)[number];

export const isShellKey = (value: unknown): value is ShellKey =>
  typeof value === 'string' && (SHELL_KEYS as readonly string[]).includes(value);

export const STYLE_TIERS = ['generated', 'curated', 'content', 'brand'] as const;
export type StyleTier = (typeof STYLE_TIERS)[number];

/** The curated launch collection (D6). designId values the resolver ships. */
export const CURATED_DESIGNS = [
  'deco',
  'fiesta',
  'quiet-formal',
  'restrained',
  'champagne-formal',
] as const;
export type CuratedDesignId = (typeof CURATED_DESIGNS)[number];

/** The generated tier's curated type pairings (D6). */
export const TYPE_VOICES = ['elegant', 'bold', 'playful', 'mono', 'script', 'clean'] as const;
export type TypeVoice = (typeof TYPE_VOICES)[number];

/**
 * The generated tier's page ground (D19): light or dark canvas. A separate
 * input because lightness is NOT derivable from the accent or the energy
 * slider (a 0.9-energy block party wants a sunlit page; a 0.9-energy night
 * out wants neon on black). Absent = dark — pre-D19 generated configs keep
 * rendering exactly as they did.
 */
export const STYLE_MODES = ['dark', 'light'] as const;
export type StyleMode = (typeof STYLE_MODES)[number];

/** Resolved CSS custom properties, stored at save time where possible. */
export type ResolvedTokens = Record<string, string>;

/**
 * Tier-discriminated style config (D6): consumers narrow on `tier` and get
 * the documented input shape. All inputs optional — the resolver owns
 * fallbacks; the config handler only enforces object-ness (cdk#743).
 */
export type StyleConfig =
  | { tier: 'generated'; inputs?: { accent?: string; photoAssetKey?: string; typeVoice?: TypeVoice; energy?: number; mode?: StyleMode }; resolved?: ResolvedTokens }
  | { tier: 'curated'; inputs?: { designId?: CuratedDesignId }; resolved?: ResolvedTokens }
  | { tier: 'content'; inputs?: { accent?: string; assetKey?: string }; resolved?: ResolvedTokens }
  | { tier: 'brand'; inputs?: { accent?: string; secondary?: string; logoAssetKey?: string }; resolved?: ResolvedTokens };

export interface ShellStyleDefaults {
  shell: ShellKey;
  style: StyleConfig;
}

/**
 * The wizard's occasion quick-pick (D14): one tap applies a persona's D4
 * defaults; everything stays overridable, nothing here persists as an
 * "occasion" field. Keys are display-stable slugs; labels live with the
 * wizard UI (vocabulary, not data).
 */
export const OCCASION_DEFAULTS = {
  wedding: { shell: 'invitation', style: { tier: 'curated', inputs: { designId: 'deco' } } },
  quinceanera: { shell: 'invitation', style: { tier: 'curated', inputs: { designId: 'fiesta' } } },
  baptism: { shell: 'invitation', style: { tier: 'curated', inputs: { designId: 'quiet-formal' } } },
  gala: { shell: 'invitation', style: { tier: 'brand', inputs: {} } },
  'art-show': { shell: 'invitation', style: { tier: 'content', inputs: {} } },
  birthday: { shell: 'board', style: { tier: 'generated', inputs: { typeVoice: 'clean', energy: 0.6 } } },
  'night-out': { shell: 'board', style: { tier: 'generated', inputs: { typeVoice: 'bold', energy: 0.9 } } },
  meetup: { shell: 'board', style: { tier: 'generated', inputs: { typeVoice: 'playful', energy: 0.8 } } },
  class: { shell: 'poster', style: { tier: 'generated', inputs: { typeVoice: 'bold', energy: 0.7 } } },
  'fun-run': { shell: 'poster', style: { tier: 'generated', inputs: { typeVoice: 'bold', energy: 0.8 } } },
  'block-party': { shell: 'poster', style: { tier: 'generated', inputs: { typeVoice: 'playful', energy: 0.9, mode: 'light' } } },
  'grand-opening': { shell: 'poster', style: { tier: 'brand', inputs: {} } },
  cupsleeve: { shell: 'poster', style: { tier: 'content', inputs: {} } },
  trip: { shell: 'itinerary', style: { tier: 'generated', inputs: { typeVoice: 'clean', energy: 0.5 } } },
  reunion: { shell: 'itinerary', style: { tier: 'generated', inputs: { typeVoice: 'clean', energy: 0.4, mode: 'light' } } },
  'celebration-of-life': { shell: 'program', style: { tier: 'curated', inputs: { designId: 'restrained' } } },
  funeral: { shell: 'program', style: { tier: 'curated', inputs: { designId: 'restrained' } } },
} satisfies Record<string, ShellStyleDefaults>;

export type OccasionKey = keyof typeof OCCASION_DEFAULTS;

/** "Something else" / no pick: today's layout, style chosen later. */
export const FALLBACK_DEFAULTS: ShellStyleDefaults = {
  shell: 'classic',
  style: { tier: 'generated', inputs: {} },
};

/**
 * Per-event chrome/module copy (cdk#776 D26): the engine's defaults are
 * GENERIC; an event opts into its own voice (the wedding tenant carries the
 * wedding words). All optional — absent key = the generic default, decided
 * where the copy renders (the guest app owns fallbacks).
 */
export interface Vocabulary {
  /** Header fallback when no display name is configured. */
  siteFallbackName?: string;
  /** Heading over the RSVP countdown. */
  countdownLabel?: string;
  /** Guestbook form heading; supports the event display name where it renders. */
  guestbookCtaLabel?: string;
  /** The no-link identity notice's "contact" phrasing. */
  contactHostNotice?: string;
}
