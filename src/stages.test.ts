import { describe, expect, it } from 'vitest';
import { PREFILL_SOURCES, STAGE_RESPONSE_META_KEYS } from './stages';

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
