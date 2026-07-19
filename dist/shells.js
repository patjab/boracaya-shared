"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.FALLBACK_DEFAULTS = exports.OCCASION_DEFAULTS = exports.STYLE_MODES = exports.TYPE_VOICES = exports.CURATED_DESIGNS = exports.STYLE_TIERS = exports.isShellKey = exports.SHELL_KEYS = void 0;
exports.SHELL_KEYS = [
    'classic',
    'invitation',
    'board',
    'poster',
    'itinerary',
    'program',
    // The full-website grammar as an explicit pick (cdk#776 D25): same chrome
    // classic wraps, but chosen — classic stays the frozen absence-fallback.
    'site',
];
const isShellKey = (value) => typeof value === 'string' && exports.SHELL_KEYS.includes(value);
exports.isShellKey = isShellKey;
exports.STYLE_TIERS = ['generated', 'curated', 'content', 'brand'];
/** The curated launch collection (D6). designId values the resolver ships. */
exports.CURATED_DESIGNS = [
    'deco',
    'fiesta',
    'quiet-formal',
    'restrained',
    'champagne-formal',
];
/** The generated tier's curated type pairings (D6). */
exports.TYPE_VOICES = ['elegant', 'bold', 'playful', 'mono', 'script', 'clean'];
/**
 * The generated tier's page ground (D19): light or dark canvas. A separate
 * input because lightness is NOT derivable from the accent or the energy
 * slider (a 0.9-energy block party wants a sunlit page; a 0.9-energy night
 * out wants neon on black). Absent = dark — pre-D19 generated configs keep
 * rendering exactly as they did.
 */
exports.STYLE_MODES = ['dark', 'light'];
/**
 * The wizard's occasion quick-pick (D14): one tap applies a persona's D4
 * defaults; everything stays overridable, nothing here persists as an
 * "occasion" field. Keys are display-stable slugs; labels live with the
 * wizard UI (vocabulary, not data).
 */
exports.OCCASION_DEFAULTS = {
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
};
/** "Something else" / no pick: today's layout, style chosen later. */
exports.FALLBACK_DEFAULTS = {
    shell: 'classic',
    style: { tier: 'generated', inputs: {} },
};
