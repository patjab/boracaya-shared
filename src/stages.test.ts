import { describe, expect, it } from 'vitest';
import {
    PREFILL_SOURCES, STAGE_RESPONSE_META_KEYS,
    guestDisplayName, isDisplayBlock, resolvePrefillSource, stageDriftKeys,
    stageElements, stageQuestions,
} from './stages';
import type { GuestRowLike, StageDisplayBlock, StageElement, StageQuestion } from './stages';

// Contract tests (cdk#962): the registry menu is consumed by the Valet picker
// and validated by the stages Lambda — its shape is a cross-repo contract.
describe('PREFILL_SOURCES', () => {
    it('every source has a namespaced id and a human label', () => {
        for (const s of PREFILL_SOURCES) {
            // Namespaced = contains a dot; bare ids are event-config keys and
            // never appear in this menu.
            expect(s.id).toMatch(/^[a-z][a-zA-Z0-9]*\.[a-z][a-zA-Z0-9]*$/);
            expect(s.label.trim().length).toBeGreaterThan(0);
        }
    });

    it('ids are unique', () => {
        const ids = PREFILL_SOURCES.map((s) => s.id);
        expect(new Set(ids).size).toBe(ids.length);
    });

    it('carries the RSVP sources: companions ×2 (cdk#962) + partyNames (cdk#976)', () => {
        const ids = PREFILL_SOURCES.map((s) => s.id);
        expect(ids).toContain('rsvp.companionNames');
        expect(ids).toContain('rsvp.companionsWithAllergies');
        expect(ids).toContain('rsvp.partyNames');
    });
});

describe('STAGE_RESPONSE_META_KEYS', () => {
    it('reserves the flat-body meta keys', () => {
        expect(STAGE_RESPONSE_META_KEYS).toEqual(['defaults', 'drift']);
    });
});

// --- element schema helpers (cdk#976) ---------------------------------------

const Q = (key: string, extra?: Partial<StageQuestion>): StageQuestion =>
    ({ key, label: key, type: 'text', ...extra });
const D = (id: string, extra?: Partial<StageDisplayBlock>): StageDisplayBlock =>
    ({ kind: 'display', id, ...extra });

describe('stage element helpers', () => {
    const mixed: StageElement[] = [D('party', { source: 'rsvp.partyNames' }), Q('hotelName'), Q('hotelArea')];

    it('isDisplayBlock discriminates on kind, treating kindless as question', () => {
        expect(isDisplayBlock(D('x'))).toBe(true);
        expect(isDisplayBlock(Q('x'))).toBe(false);
        expect(isDisplayBlock(Q('x', { kind: 'question' }))).toBe(false);
    });

    it('stageElements reads elements only, then empty (cdk#2132)', () => {
        expect(stageElements({ elements: mixed })).toBe(mixed);
        // A stray legacy `fields` list is not read (cast: it is not on the type).
        expect(stageElements({ fields: [Q('a')] } as unknown as { elements?: typeof mixed }))
            .toEqual([]);
        expect(stageElements({})).toEqual([]);
    });

    it('stageQuestions keeps only the askable subset, in order', () => {
        expect(stageQuestions(mixed).map((q) => q.key)).toEqual(['hotelName', 'hotelArea']);
    });
});

// These fixtures MIRROR tests/lambdas/test_pda_boracay_stages.py in boracaya-cdk
// (the prefill.py resolvers) — same inputs, same outputs, one drift semantics.
// Resolvers take the guest ROW since cdk#976, matching prefill.py.
const RSVP = {
    companions: [
        { name: ' Jordan ', allergies: 'peanuts' },
        { name: 'Riley', allergies: '' },
        'not-a-dict', { name: 7 }, { name: '  ' }, { name: 'Ash', allergies: 3 },
    ],
};
// Companions live in the core-stage response (stages.RSVP), their sole home
// since cdk#1016/#2132.
const core = (c: Record<string, unknown>) => ({ stages: { RSVP: c } });
const ROW = { firstName: 'Sam', lastName: 'Reyes', ...core(RSVP) };
// A row as it looked before cdk#1174: the legacy `rsvp` map, which the
// resolvers no longer read. Cast because the field is gone from GuestRowLike.
const legacy = (rsvp: Record<string, unknown>, rest: Record<string, unknown> = {}) =>
    ({ ...rest, rsvp }) as GuestRowLike;

describe('guestDisplayName (mirror of the Lambda guest_display_name)', () => {
    it('row names first, then the top-level preferredName, empty when nothing known', () => {
        expect(guestDisplayName(ROW)).toBe('Sam Reyes');
        expect(guestDisplayName({ firstName: ' Sam ' })).toBe('Sam');
        expect(guestDisplayName({ preferredName: ' Sammy ' })).toBe('Sammy');
        expect(guestDisplayName({ firstName: 7, preferredName: 7 })).toBe('');
        expect(guestDisplayName(undefined)).toBe('');
        // Invited names outrank it: an organizer's roster reads the invitation first.
        expect(guestDisplayName({ firstName: 'Sam', lastName: 'Reyes',
                                  preferredName: 'Promoted' })).toBe('Sam Reyes');
    });

    // cdk#2132: the legacy `rsvp` map candidates are gone.
    it('never reads the legacy rsvp map', () => {
        expect(guestDisplayName(legacy({ preferredName: 'Sammy', name: 'Samuel' }))).toBe('');
        expect(guestDisplayName(legacy({ name: 'Samuel' }, { preferredName: 'Promoted' })))
            .toBe('Promoted');
    });
});

describe('resolvePrefillSource (mirror of the Lambda resolvers)', () => {
    it('flattens companion names, guarding every malformed shape', () => {
        expect(resolvePrefillSource('rsvp.companionNames', ROW))
            .toEqual(['Jordan', 'Riley', 'Ash']);
    });

    it('flattens companions with allergies as self-contained strings', () => {
        expect(resolvePrefillSource('rsvp.companionsWithAllergies', ROW))
            .toEqual(['Jordan (peanuts)', 'Riley', 'Ash']);
    });

    it('partyNames = display name + companions; companions alone when nameless', () => {
        expect(resolvePrefillSource('rsvp.partyNames', ROW))
            .toEqual(['Sam Reyes', 'Jordan', 'Riley', 'Ash']);
        expect(resolvePrefillSource('rsvp.partyNames', core(RSVP)))
            .toEqual(['Jordan', 'Riley', 'Ash']);
        expect(resolvePrefillSource('rsvp.partyNames', { firstName: 'Solo', ...core({}) }))
            .toEqual(['Solo']);
    });

    it('returns undefined for bare ids, unknown ids, and empty resolutions', () => {
        expect(resolvePrefillSource('blockHotelName', ROW)).toBeUndefined();
        expect(resolvePrefillSource('rsvp.companons', ROW)).toBeUndefined();
        expect(resolvePrefillSource('rsvp.companionNames', core({ companions: [] }))).toBeUndefined();
        expect(resolvePrefillSource('rsvp.partyNames', core({}))).toBeUndefined();
        expect(resolvePrefillSource('rsvp.companionNames', undefined)).toBeUndefined();
    });

    it('Object.prototype members are not resolvers (cdk#1285) — never a bare string as string[]', () => {
        expect(resolvePrefillSource('toString', ROW)).toBeUndefined();
        expect(resolvePrefillSource('hasOwnProperty', ROW)).toBeUndefined();
        expect(resolvePrefillSource('constructor', ROW)).toBeUndefined();
    });
});

describe('stageDriftKeys (mirror of the Lambda drift_keys)', () => {
    const FIELDS = [
        { key: 'companions', defaultFrom: 'rsvp.companionNames' },
        { key: 'hotelName', defaultFrom: 'blockHotelName' },  // bare: never compared
        { key: 'notes' },                                      // no edge: never compared
    ];
    const guest = core({ companions: [{ name: 'Jordan', allergies: '' }, { name: 'Riley', allergies: '' }] });

    it('reorder + whitespace is not drift; a real difference is', () => {
        expect(stageDriftKeys(FIELDS, guest, { companions: ['Riley', ' Jordan '] })).toEqual([]);
        expect(stageDriftKeys(FIELDS, guest, { companions: ['Jordan'] })).toEqual(['companions']);
    });

    it('declared edges only — no saved answer, no source data, no payload', () => {
        expect(stageDriftKeys(FIELDS, guest, { hotelName: 'Sea Breeze' })).toEqual([]);
        expect(stageDriftKeys(FIELDS, {}, { companions: ['Jordan'] })).toEqual([]);
        expect(stageDriftKeys(FIELDS, guest, undefined)).toEqual([]);
    });

    it('a defaultFrom naming an Object.prototype key is not a declared edge (cdk#1285)', () => {
        const protoFields = [{ key: 'companions', defaultFrom: 'toString' }];
        expect(stageDriftKeys(protoFields, guest, { companions: ['Jordan'] })).toEqual([]);
    });
});

// --- cdk#1010: presentation rides the settings map --------------------------
import { stagePresentation } from './stages';

describe('stagePresentation (cdk#1010)', () => {
    it("reads settings.presentation === 'stepped'", () => {
        expect(stagePresentation({ settings: { presentation: 'stepped' } })).toBe('stepped');
    });
    it('absent settings, absent key, explicit flat, and junk are ALL flat — an old renderer can never meet a value it predates', () => {
        expect(stagePresentation({})).toBe('flat');
        expect(stagePresentation({ settings: {} })).toBe('flat');
        expect(stagePresentation({ settings: { presentation: 'flat' } })).toBe('flat');
        expect(stagePresentation({ settings: { presentation: 'sideways' } })).toBe('flat');
    });
});

// --- cdk#1012: the core-stage constants -------------------------------------
import { ATTENDANCE_KEY, CORE_STAGE_ID, DEFAULT_CORE_STAGE } from './stages';

describe('DEFAULT_CORE_STAGE (cdk#1012)', () => {
    it('pins the canonical shape both runtimes carry (the lambda copy is authoritative)', () => {
        expect(CORE_STAGE_ID).toBe('RSVP');
        expect(DEFAULT_CORE_STAGE.stageId).toBe(CORE_STAGE_ID);
        expect(DEFAULT_CORE_STAGE.core).toBe(true);
        // cdk#1014: the core confirms by default — todays RSVP mail, preserved.
        expect(DEFAULT_CORE_STAGE.settings.confirmation).toBe('generic');
        // Keyed, not positional (cdk#1171 inserted a question mid-list and the
        // old destructure silently re-pointed `party` at its neighbour).
        const byKey = Object.fromEntries(DEFAULT_CORE_STAGE.elements.map((e) => [e.key, e]));
        expect(DEFAULT_CORE_STAGE.elements.map((e) => e.key)).toEqual([
            ATTENDANCE_KEY, 'hasFoodRestrictions', 'foodRestrictionsText', 'companions',
        ]);
        expect(byKey[ATTENDANCE_KEY]).toMatchObject({ type: 'boolean', required: true, core: true });
        // cdk#1171: the dietary flag and its free text are BOTH engine questions
        // now — a guest can say what the restriction is, not just that one exists.
        expect(byKey.hasFoodRestrictions).toMatchObject({ type: 'boolean' });
        expect(byKey.foodRestrictionsText).toMatchObject({ type: 'text', maxLength: 500 });
        expect(byKey.companions).toMatchObject({ type: 'repeatingGroup' });
        expect(byKey.companions.subFields?.map((sf) => sf.key)).toEqual(['name', 'allergies']);
        // Identity stays with the shell (A6): no name/email questions here.
        expect(DEFAULT_CORE_STAGE.elements.some((e) => /email|firstName|lastName/.test(e.key))).toBe(false);
    });
});

// --- cdk#1016: resolvers prefer the core-stage response -----------------------
describe('companion resolvers core precedence (cdk#1016)', () => {
    it('stages.RSVP.companions only; empty core list is an answer; the legacy map is never read', () => {
        const both = legacy({ companions: [{ name: 'Legacy Kid' }] },
                            core({ companions: [{ name: 'Core Kid' }] }));
        expect(resolvePrefillSource('rsvp.companionNames', both)).toEqual(['Core Kid']);
        const emptyCore = legacy({ companions: [{ name: 'Legacy Kid' }] },
                                 core({ companions: [] }));
        expect(resolvePrefillSource('rsvp.companionNames', emptyCore)).toBeUndefined();
        const legacyOnly = legacy({ companions: [{ name: 'Legacy Kid' }] });
        expect(resolvePrefillSource('rsvp.companionNames', legacyOnly)).toBeUndefined();
    });
});
