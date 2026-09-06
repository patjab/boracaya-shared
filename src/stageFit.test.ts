import { describe, expect, it } from 'vitest';
import { fitsFieldType } from './stageFit';
import type { StageField } from './stages';

// The one answer-fits-question predicate (valet#670). These cases are the UNION
// of the two mirrors it replaced — shore's `stageValues.test.ts` (shore#326,
// Codex r1/r2 on it) and valet's `fitsFieldType.test.ts` (valet#669) — so both
// consumers' behaviour is pinned here and nowhere else. The authority is the
// stages Lambda's validate_submission / _check_group_value (boracaya-cdk).
const field = (type: string, extra: Record<string, unknown> = {}): StageField =>
    ({ key: 'k', label: 'L', type, ...extra } as unknown as StageField);

describe('fitsFieldType — does a stored answer still fit the question', () => {
    it.each([
        ['text', 'a few words', true],
        ['text', 42, false],
        ['multiline', 'a\nb', true],
        ['multiline', ['a'], false],
        ['number', 12, true],
        ['number', 2.5, true],
        ['number', -3, true],
        ['number', '5J 108', false],
        ['number', '5', false],
        ['number', Number.NaN, false],
        ['boolean', false, true],
        ['boolean', 'yes', false],
        ['boolean', 'true', false],
        ['list', ['a', 'b'], true],
        ['list', [], true],
        ['list', 'a', false],
        ['list', [1], false],
        ['date', '2026-11-01', true],
        ['date', '01/11/2026', false],
        ['date', 'May 1, 2026', false],
        ['date', 20260501, false],
    ])('%s accepts %p -> %p', (type, value, expected) => {
        expect(fitsFieldType(field(type), value)).toBe(expected);
    });

    // The Lambda calls this one out specially: a bool is not a number there.
    it('mirrors the Lambda in rejecting a boolean for a number', () => {
        expect(fitsFieldType(field('number'), true)).toBe(false);
    });

    it('select is MEMBERSHIP: a dropped option makes the stored choice stale', () => {
        const withOptions = field('select', { options: ['Veg', 'Meat'] });
        expect(fitsFieldType(withOptions, 'Veg')).toBe(true);
        // The stored choice is gone: the widget shows nothing, so keeping it
        // would submit a value the guest can neither see nor change.
        expect(fitsFieldType(withOptions, 'Vegan')).toBe(false);
        // No options at all (the moment after a restyle to select): nothing fits.
        expect(fitsFieldType(field('select'), 'anything')).toBe(false);
    });

    // The Lambda reads a list as "non-blank short strings"; shore's old mirror
    // took any string array and valet's took non-blank only — this is the drift
    // the consolidation removes, on the Lambda's side.
    it('list refuses a blank entry, as the Lambda does', () => {
        expect(fitsFieldType(field('list'), ['  '])).toBe(false);
        expect(fitsFieldType(field('list'), ['Jordan', ''])).toBe(false);
    });

    // Codex r1 on shore#326. The first version of this test used only
    // '2026-13-99', where the MONTH is syntactically impossible and Date.parse
    // returns NaN. That hid the real hazard: Date.parse NORMALIZES an
    // over-range DAY instead of rejecting it, so every case below was accepted
    // while looking checked. Python's date.fromisoformat rejects all of them.
    it.each([
        ['2026-13-99', 'impossible month — the only case Date.parse rejects alone'],
        ['2026-13-01', 'impossible month, real day'],
        ['2026-02-30', 'normalizes to 2026-03-02'],
        ['2026-04-31', 'normalizes to 2026-05-01'],
        ['2026-02-29', 'not a leap year — normalizes to 2026-03-01'],
        // Codex r2: JS has an astronomical year 0 and round-trips this one, so
        // the round-trip alone does not catch it; date.fromisoformat rejects it.
        ['0000-01-01', 'year zero — out of range for the Lambda, unshowable'],
    ])('rejects %s (%s)', (value) => {
        expect(fitsFieldType(field('date'), value)).toBe(false);
    });

    it('accepts real days, including a genuine leap day', () => {
        expect(fitsFieldType(field('date'), '2026-11-01')).toBe(true);
        expect(fitsFieldType(field('date'), '2024-02-29')).toBe(true);
        // The year-zero rejection must not swallow the years either side of the
        // range the Lambda actually accepts (1-9999).
        expect(fitsFieldType(field('date'), '0001-01-01')).toBe(true);
        expect(fitsFieldType(field('date'), '9999-12-31')).toBe(true);
    });

    // The line is "can the guest SEE it?", not "would the server take it".
    it('KEEPS text past a lowered maxLength — visible, and the guest can trim it', () => {
        expect(fitsFieldType(field('text', { maxLength: 3 }), 'far too long')).toBe(true);
    });

    it('KEEPS a value under a type it does not recognise, rather than destroying it', () => {
        expect(fitsFieldType(field('someFutureType'), 'whatever')).toBe(true);
    });
});

describe('fitsFieldType — repeating groups (cdk#1011, mirror of _check_group_value)', () => {
    it('takes a list of flat primitive entries; an explicit null inside an entry is absence', () => {
        expect(fitsFieldType(field('repeatingGroup'), [{ name: 'A', n: 1 }])).toBe(true);
        expect(fitsFieldType(field('repeatingGroup'), [])).toBe(true);
        expect(fitsFieldType(
            field('repeatingGroup', { subFields: [{ key: 'who', label: 'Who', type: 'text' }] }),
            [{ who: 'Jordan', nights: 2, veg: true, note: null }],
        )).toBe(true);
    });

    it.each([
        ['a bare string', 'Jordan'],
        ['a null entry', [null]],
        ['an array entry', [['Jordan']]],
        ['a nested object', [{ who: { nested: true } }]],
        ['a nested list', [{ nested: [1] }]],
    ])('rejects %s', (_label, value) => {
        expect(fitsFieldType(field('repeatingGroup'), value)).toBe(false);
    });

    // The gap valet#669 pinned and left for this consolidation: restyling a
    // SUB-field does the identical harm one level down.
    it('judges each present sub-field value by its declared sub-type', () => {
        const group = (type: string, extra: Record<string, unknown> = {}) =>
            field('repeatingGroup', { subFields: [{ key: 'who', label: 'Who', type, ...extra }] });
        expect(fitsFieldType(group('number'), [{ who: 'not a number' }])).toBe(false);
        expect(fitsFieldType(group('number'), [{ who: 2 }])).toBe(true);
        expect(fitsFieldType(group('select', { options: ['A'] }), [{ who: 'B' }])).toBe(false);
        expect(fitsFieldType(group('select', { options: ['A'] }), [{ who: 'A' }])).toBe(true);
        expect(fitsFieldType(group('date'), [{ who: '2026-02-30' }])).toBe(false);
        expect(fitsFieldType(group('boolean'), [{ who: 'yes' }])).toBe(false);
        // Absent and null are absence, never a mismatch — required is not a shape.
        expect(fitsFieldType(group('number'), [{}, { who: null }])).toBe(true);
        // An undeclared key is not judged: shore's seeding keeps declared
        // sub-fields only, so it never reaches the guest.
        expect(fitsFieldType(group('number'), [{ who: 1, extra: 'x' }])).toBe(true);
    });
});
