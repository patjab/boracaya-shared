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
export declare const SHELL_KEYS: readonly ["classic", "invitation", "board", "poster", "itinerary", "program", "site"];
export type ShellKey = (typeof SHELL_KEYS)[number];
export declare const isShellKey: (value: unknown) => value is ShellKey;
export declare const STYLE_TIERS: readonly ["generated", "curated", "content", "brand"];
export type StyleTier = (typeof STYLE_TIERS)[number];
/** The curated launch collection (D6). designId values the resolver ships. */
export declare const CURATED_DESIGNS: readonly ["deco", "fiesta", "quiet-formal", "restrained", "champagne-formal"];
export type CuratedDesignId = (typeof CURATED_DESIGNS)[number];
/** The generated tier's curated type pairings (D6). */
export declare const TYPE_VOICES: readonly ["elegant", "bold", "playful", "mono", "script", "clean"];
export type TypeVoice = (typeof TYPE_VOICES)[number];
/**
 * The generated tier's page ground (D19): light or dark canvas. A separate
 * input because lightness is NOT derivable from the accent or the energy
 * slider (a 0.9-energy block party wants a sunlit page; a 0.9-energy night
 * out wants neon on black). Absent = dark — pre-D19 generated configs keep
 * rendering exactly as they did.
 */
export declare const STYLE_MODES: readonly ["dark", "light"];
export type StyleMode = (typeof STYLE_MODES)[number];
/** Resolved CSS custom properties, stored at save time where possible. */
export type ResolvedTokens = Record<string, string>;
/**
 * Tier-discriminated style config (D6): consumers narrow on `tier` and get
 * the documented input shape. All inputs optional — the resolver owns
 * fallbacks; the config handler only enforces object-ness (cdk#743).
 */
export type StyleConfig = {
    tier: 'generated';
    inputs?: {
        accent?: string;
        photoAssetKey?: string;
        typeVoice?: TypeVoice;
        energy?: number;
        mode?: StyleMode;
    };
    resolved?: ResolvedTokens;
} | {
    tier: 'curated';
    inputs?: {
        designId?: CuratedDesignId;
    };
    resolved?: ResolvedTokens;
} | {
    tier: 'content';
    inputs?: {
        accent?: string;
        assetKey?: string;
    };
    resolved?: ResolvedTokens;
} | {
    tier: 'brand';
    inputs?: {
        accent?: string;
        secondary?: string;
        logoAssetKey?: string;
    };
    resolved?: ResolvedTokens;
};
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
export declare const OCCASION_DEFAULTS: {
    wedding: {
        shell: "invitation";
        style: {
            tier: "curated";
            inputs: {
                designId: "deco";
            };
        };
    };
    quinceanera: {
        shell: "invitation";
        style: {
            tier: "curated";
            inputs: {
                designId: "fiesta";
            };
        };
    };
    baptism: {
        shell: "invitation";
        style: {
            tier: "curated";
            inputs: {
                designId: "quiet-formal";
            };
        };
    };
    gala: {
        shell: "invitation";
        style: {
            tier: "brand";
            inputs: {};
        };
    };
    'art-show': {
        shell: "invitation";
        style: {
            tier: "content";
            inputs: {};
        };
    };
    birthday: {
        shell: "board";
        style: {
            tier: "generated";
            inputs: {
                typeVoice: "clean";
                energy: number;
            };
        };
    };
    'night-out': {
        shell: "board";
        style: {
            tier: "generated";
            inputs: {
                typeVoice: "bold";
                energy: number;
            };
        };
    };
    meetup: {
        shell: "board";
        style: {
            tier: "generated";
            inputs: {
                typeVoice: "playful";
                energy: number;
            };
        };
    };
    class: {
        shell: "poster";
        style: {
            tier: "generated";
            inputs: {
                typeVoice: "bold";
                energy: number;
            };
        };
    };
    'fun-run': {
        shell: "poster";
        style: {
            tier: "generated";
            inputs: {
                typeVoice: "bold";
                energy: number;
            };
        };
    };
    'block-party': {
        shell: "poster";
        style: {
            tier: "generated";
            inputs: {
                typeVoice: "playful";
                energy: number;
                mode: "light";
            };
        };
    };
    'grand-opening': {
        shell: "poster";
        style: {
            tier: "brand";
            inputs: {};
        };
    };
    cupsleeve: {
        shell: "poster";
        style: {
            tier: "content";
            inputs: {};
        };
    };
    trip: {
        shell: "itinerary";
        style: {
            tier: "generated";
            inputs: {
                typeVoice: "clean";
                energy: number;
            };
        };
    };
    reunion: {
        shell: "itinerary";
        style: {
            tier: "generated";
            inputs: {
                typeVoice: "clean";
                energy: number;
                mode: "light";
            };
        };
    };
    'celebration-of-life': {
        shell: "program";
        style: {
            tier: "curated";
            inputs: {
                designId: "restrained";
            };
        };
    };
    funeral: {
        shell: "program";
        style: {
            tier: "curated";
            inputs: {
                designId: "restrained";
            };
        };
    };
};
export type OccasionKey = keyof typeof OCCASION_DEFAULTS;
/** "Something else" / no pick: today's layout, style chosen later. */
export declare const FALLBACK_DEFAULTS: ShellStyleDefaults;
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
