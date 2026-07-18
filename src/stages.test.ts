import { describe, expect, it } from 'vitest';
import {
    PREFILL_SOURCES, STAGE_RESPONSE_META_KEYS,
    guestDisplayName, isDisplayBlock, resolvePrefillSource, stageDriftKeys,
    stageElements, stageQuestions,
} from './stages';
import type { StageDisplayBlock, StageElement, StageQuestion } from './stages';

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

    it('stageElements prefers elements, falls back to legacy fields, then empty', () => {
        expect(stageElements({ elements: mixed })).toBe(mixed);
        const fields = [Q('a')];
        expect(stageElements({ fields })).toBe(fields);
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
const ROW = { firstName: 'Sam', lastName: 'Reyes', rsvp: RSVP };

describe('guestDisplayName (mirror of the Lambda guest_display_name)', () => {
    it('row names first, RSVP fallbacks second, empty when nothing known', () => {
        expect(guestDisplayName(ROW)).toBe('Sam Reyes');
        expect(guestDisplayName({ firstName: ' Sam ' })).toBe('Sam');
        expect(guestDisplayName({ rsvp: { preferredName: 'Sammy', name: 'Samuel' } })).toBe('Sammy');
        expect(guestDisplayName({ rsvp: { name: 'Samuel' } })).toBe('Samuel');
        expect(guestDisplayName({ firstName: 7, rsvp: {} })).toBe('');
        expect(guestDisplayName(undefined)).toBe('');
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
        expect(resolvePrefillSource('rsvp.partyNames', { rsvp: RSVP }))
            .toEqual(['Jordan', 'Riley', 'Ash']);
        expect(resolvePrefillSource('rsvp.partyNames', { firstName: 'Solo', rsvp: {} }))
            .toEqual(['Solo']);
    });

    it('returns undefined for bare ids, unknown ids, and empty resolutions', () => {
        expect(resolvePrefillSource('blockHotelName', ROW)).toBeUndefined();
        expect(resolvePrefillSource('rsvp.companons', ROW)).toBeUndefined();
        expect(resolvePrefillSource('rsvp.companionNames', { rsvp: { companions: [] } })).toBeUndefined();
        expect(resolvePrefillSource('rsvp.partyNames', { rsvp: {} })).toBeUndefined();
        expect(resolvePrefillSource('rsvp.companionNames', undefined)).toBeUndefined();
    });
});

describe('stageDriftKeys (mirror of the Lambda drift_keys)', () => {
    const FIELDS = [
        { key: 'companions', defaultFrom: 'rsvp.companionNames' },
        { key: 'hotelName', defaultFrom: 'blockHotelName' },  // bare: never compared
        { key: 'notes' },                                      // no edge: never compared
    ];
    const guest = { rsvp: { companions: [{ name: 'Jordan', allergies: '' }, { name: 'Riley', allergies: '' }] } };

    it('reorder + whitespace is not drift; a real difference is', () => {
        expect(stageDriftKeys(FIELDS, guest, { companions: ['Riley', ' Jordan '] })).toEqual([]);
        expect(stageDriftKeys(FIELDS, guest, { companions: ['Jordan'] })).toEqual(['companions']);
    });

    it('declared edges only — no saved answer, no source data, no payload', () => {
        expect(stageDriftKeys(FIELDS, guest, { hotelName: 'Sea Breeze' })).toEqual([]);
        expect(stageDriftKeys(FIELDS, {}, { companions: ['Jordan'] })).toEqual([]);
        expect(stageDriftKeys(FIELDS, guest, undefined)).toEqual([]);
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
        const [attend, food, party] = DEFAULT_CORE_STAGE.elements;
        expect(attend).toMatchObject({ key: ATTENDANCE_KEY, type: 'boolean', required: true, core: true });
        expect(food.key).toBe('hasFoodRestrictions');
        expect(party).toMatchObject({ type: 'repeatingGroup', key: 'companions' });
        expect(party.subFields?.map((sf) => sf.key)).toEqual(['name', 'allergies']);
        // Identity stays with the shell (A6): no name/email questions here.
        expect(DEFAULT_CORE_STAGE.elements.some((e) => /email|firstName|lastName/.test(e.key))).toBe(false);
    });
});

// --- cdk#1016: resolvers prefer the core-stage response -----------------------
describe('companion resolvers core precedence (cdk#1016)', () => {
    it('stages.RSVP.companions wins; empty core list is an answer; legacy is the fallback', () => {
        const both = { stages: { RSVP: { companions: [{ name: 'Core Kid' }] } },
                       rsvp: { companions: [{ name: 'Legacy Kid' }] } };
        expect(resolvePrefillSource('rsvp.companionNames', both)).toEqual(['Core Kid']);
        const emptyCore = { stages: { RSVP: { companions: [] } },
                            rsvp: { companions: [{ name: 'Legacy Kid' }] } };
        expect(resolvePrefillSource('rsvp.companionNames', emptyCore)).toBeUndefined();
        const legacyOnly = { rsvp: { companions: [{ name: 'Legacy Kid' }] } };
        expect(resolvePrefillSource('rsvp.companionNames', legacyOnly)).toEqual(['Legacy Kid']);
    });
});
