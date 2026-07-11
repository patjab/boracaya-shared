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
export declare const SHELL_KEYS: readonly ["classic", "invitation", "board", "poster", "itinerary", "program"];
export type ShellKey = (typeof SHELL_KEYS)[number];
export declare const STYLE_TIERS: readonly ["generated", "curated", "content", "brand"];
export type StyleTier = (typeof STYLE_TIERS)[number];
/** The curated launch collection (D6). designId values the resolver ships. */
export declare const CURATED_DESIGNS: readonly ["deco", "fiesta", "quiet-formal", "restrained", "champagne-formal"];
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
export declare const OCCASION_DEFAULTS: Record<string, ShellStyleDefaults>;
/** "Something else" / no pick: today's layout, style chosen later. */
export declare const FALLBACK_DEFAULTS: ShellStyleDefaults;
