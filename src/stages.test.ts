import { describe, expect, it } from 'vitest';
import {
    PREFILL_SOURCES, STAGE_RESPONSE_META_KEYS, resolvePrefillSource, stageDriftKeys,
} from './stages';

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

    it('carries the two v1 RSVP companion sources', () => {
        const ids = PREFILL_SOURCES.map((s) => s.id);
        expect(ids).toContain('rsvp.companionNames');
        expect(ids).toContain('rsvp.companionsWithAllergies');
    });
});

describe('STAGE_RESPONSE_META_KEYS', () => {
    it('reserves the flat-body meta keys', () => {
        expect(STAGE_RESPONSE_META_KEYS).toEqual(['defaults', 'drift']);
    });
});

// These fixtures MIRROR tests/lambdas/test_pda_boracay_stages.py in boracaya-cdk
// (the prefill.py resolvers) — same inputs, same outputs, one drift semantics.
const RSVP = {
    companions: [
        { name: ' Jordan ', allergies: 'peanuts' },
        { name: 'Riley', allergies: '' },
        'not-a-dict', { name: 7 }, { name: '  ' }, { name: 'Ash', allergies: 3 },
    ],
};

describe('resolvePrefillSource (mirror of the Lambda resolvers)', () => {
    it('flattens companion names, guarding every malformed shape', () => {
        expect(resolvePrefillSource('rsvp.companionNames', RSVP))
            .toEqual(['Jordan', 'Riley', 'Ash']);
    });

    it('flattens companions with allergies as self-contained strings', () => {
        expect(resolvePrefillSource('rsvp.companionsWithAllergies', RSVP))
            .toEqual(['Jordan (peanuts)', 'Riley', 'Ash']);
    });

    it('returns undefined for bare ids, unknown ids, and empty resolutions', () => {
        expect(resolvePrefillSource('blockHotelName', RSVP)).toBeUndefined();
        expect(resolvePrefillSource('rsvp.companons', RSVP)).toBeUndefined();
        expect(resolvePrefillSource('rsvp.companionNames', { companions: [] })).toBeUndefined();
        expect(resolvePrefillSource('rsvp.companionNames', undefined)).toBeUndefined();
    });
});

describe('stageDriftKeys (mirror of the Lambda drift_keys)', () => {
    const FIELDS = [
        { key: 'companions', defaultFrom: 'rsvp.companionNames' },
        { key: 'hotelName', defaultFrom: 'blockHotelName' },  // bare: never compared
        { key: 'notes' },                                      // no edge: never compared
    ];
    const rsvp = { companions: [{ name: 'Jordan', allergies: '' }, { name: 'Riley', allergies: '' }] };

    it('reorder + whitespace is not drift; a real difference is', () => {
        expect(stageDriftKeys(FIELDS, rsvp, { companions: ['Riley', ' Jordan '] })).toEqual([]);
        expect(stageDriftKeys(FIELDS, rsvp, { companions: ['Jordan'] })).toEqual(['companions']);
    });

    it('declared edges only — no saved answer, no source data, no payload', () => {
        expect(stageDriftKeys(FIELDS, rsvp, { hotelName: 'Sea Breeze' })).toEqual([]);
        expect(stageDriftKeys(FIELDS, {}, { companions: ['Jordan'] })).toEqual([]);
        expect(stageDriftKeys(FIELDS, rsvp, undefined)).toEqual([]);
    });
});
