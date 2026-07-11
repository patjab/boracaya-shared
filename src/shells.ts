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
] as const;
export type ShellKey = (typeof SHELL_KEYS)[number];

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

export interface StyleConfig {
  tier: StyleTier;
  /** Organizer inputs per tier (D6): generated {accent|photo, typeVoice,
   * energy} · curated {designId} · content {accent, assetKey?} · brand
   * {accent, secondary?, logoAssetKey?}. Free-shaped by design — the config
   * handler only enforces object-ness; the resolver owns interpretation. */
  inputs?: Record<string, unknown>;
  /** Resolved CSS custom properties, stored at save time where possible. */
  resolved?: Record<string, string>;
}

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
  'block-party': { shell: 'poster', style: { tier: 'generated', inputs: { typeVoice: 'playful', energy: 0.9 } } },
  'grand-opening': { shell: 'poster', style: { tier: 'brand', inputs: {} } },
  cupsleeve: { shell: 'poster', style: { tier: 'content', inputs: {} } },
  trip: { shell: 'itinerary', style: { tier: 'generated', inputs: { typeVoice: 'clean', energy: 0.5 } } },
  reunion: { shell: 'itinerary', style: { tier: 'generated', inputs: { typeVoice: 'clean', energy: 0.4 } } },
  'celebration-of-life': { shell: 'program', style: { tier: 'curated', inputs: { designId: 'restrained' } } },
  funeral: { shell: 'program', style: { tier: 'curated', inputs: { designId: 'restrained' } } },
} satisfies Record<string, ShellStyleDefaults>;

export type OccasionKey = keyof typeof OCCASION_DEFAULTS;

/** "Something else" / no pick: today's layout, style chosen later. */
export const FALLBACK_DEFAULTS: ShellStyleDefaults = {
  shell: 'classic',
  style: { tier: 'generated', inputs: {} },
};
