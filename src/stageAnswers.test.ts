import { describe, expect, it } from 'vitest';
import {
    entryMissingSubFields, stageAnswerGaps, stageAnswersComplete, visibleStageElements,
} from './stageAnswers';
import { DEFAULT_CORE_STAGE, coreStageFallback } from './stages';
import type { StageElement, StageQuestion, StageSubField } from './stages';

/**
 * The one completeness rule (shore#686, shore#704): a consumer's submit is held
 * until every question the guest can see now is answered, and every entry of a
 * repeating group that holds anything has its required sub-fields filled.
 */

const core = (): StageElement[] => [...coreStageFallback().elements ?? []];
const COMPANION_SUBS: StageSubField[] = [
    { key: 'name', label: 'Name', type: 'text', required: true },
    { key: 'allergies', label: 'Allergies', type: 'text' },
];

describe('stageAnswersComplete: required questions (shore#686)', () => {
    it('an unanswered required attendance is incomplete; Yes and No both answer it', () => {
        expect(stageAnswersComplete(core(), {})).toBe(false);
        expect(stageAnswerGaps(core(), {})).toEqual([{ kind: 'unanswered', key: 'isAttending' }]);
        expect(stageAnswersComplete(core(), { isAttending: true })).toBe(true);
        // A declined boolean IS an answer.
        expect(stageAnswersComplete(core(), { isAttending: false })).toBe(true);
    });

    it("'', [] and undefined do not answer a required question; 0 and false do", () => {
        const q = (type: StageQuestion['type']): StageElement[] =>
            [{ key: 'q', label: 'Q', type, required: true }];
        expect(stageAnswersComplete(q('text'), { q: '' })).toBe(false);
        expect(stageAnswersComplete(q('text'), {})).toBe(false);
        expect(stageAnswersComplete(q('list'), { q: [] })).toBe(false);
        expect(stageAnswersComplete(q('number'), { q: 0 })).toBe(true);
        expect(stageAnswersComplete(q('boolean'), { q: false })).toBe(true);
        expect(stageAnswersComplete(q('text'), { q: 'x' })).toBe(true);
        expect(stageAnswersComplete(q('list'), { q: ['a'] })).toBe(true);
    });

    it('a required question on the last screen counts (the stepped finish case)', () => {
        const elements = [...core(), { key: 'mealChoice', label: 'Meal choice', type: 'text', required: true } as StageQuestion];
        expect(stageAnswerGaps(elements, { isAttending: true }))
            .toEqual([{ kind: 'unanswered', key: 'mealChoice' }]);
        expect(stageAnswersComplete(elements, { isAttending: true, mealChoice: 'Fish' })).toBe(true);
    });

    it('questions cut by the core gate (attendance No) are ignored', () => {
        const elements = [...core(), { key: 'mealChoice', label: 'Meal choice', type: 'text', required: true } as StageQuestion];
        expect(stageAnswersComplete(elements, { isAttending: false })).toBe(true);
    });

    it('a question hidden by an unmet revealWhen is ignored; revealed, it counts', () => {
        const elements: StageElement[] = [
            { key: 'flag', label: 'Flag', type: 'boolean' },
            { key: 'detail', label: 'Detail', type: 'text', required: true,
                revealWhen: { key: 'flag', equals: true } },
        ];
        expect(stageAnswersComplete(elements, {})).toBe(true);
        expect(stageAnswersComplete(elements, { flag: false })).toBe(true);
        expect(stageAnswersComplete(elements, { flag: true })).toBe(false);
        expect(stageAnswersComplete(elements, { flag: true, detail: 'nuts' })).toBe(true);
    });

    it('adminOnly questions and display blocks are never asked of the guest', () => {
        const elements: StageElement[] = [
            { key: 'internal', label: 'Internal', type: 'text', required: true, adminOnly: true },
            { kind: 'display', id: 'note', text: 'Bring sunscreen' },
        ];
        expect(stageAnswersComplete(elements, {})).toBe(true);
    });

    it('an empty stage is complete', () => {
        expect(stageAnswersComplete([], {})).toBe(true);
    });
});

describe('entryMissingSubFields / repeating groups (shore#704)', () => {
    it('an entry with only allergies is missing its required name', () => {
        expect(entryMissingSubFields(COMPANION_SUBS, { allergies: 'peanuts' })).toEqual(['name']);
    });

    it('an empty entry is complete (it is dropped, not sent)', () => {
        expect(entryMissingSubFields(COMPANION_SUBS, {})).toEqual([]);
        expect(entryMissingSubFields(COMPANION_SUBS, { name: '', allergies: '  ' })).toEqual([]);
    });

    it('a filled entry is complete; a blank-only name does not count as a name', () => {
        expect(entryMissingSubFields(COMPANION_SUBS, { name: 'Ana', allergies: 'nuts' })).toEqual([]);
        expect(entryMissingSubFields(COMPANION_SUBS, { name: 'Ana' })).toEqual([]);
        expect(entryMissingSubFields(COMPANION_SUBS, { name: '   ', allergies: 'nuts' })).toEqual(['name']);
    });

    it('reads required from the definition, not a hard-coded name', () => {
        const subs: StageSubField[] = [
            { key: 'name', label: 'Name', type: 'text' },
            { key: 'age', label: 'Age', type: 'number', required: true },
            { key: 'vegan', label: 'Vegan', type: 'boolean', required: true },
        ];
        expect(entryMissingSubFields(subs, { name: 'Mia' })).toEqual(['age', 'vegan']);
        expect(entryMissingSubFields(subs, { name: 'Mia', age: 0, vegan: false })).toEqual([]);
        expect(entryMissingSubFields(subs, { name: 'Mia', age: Number.NaN, vegan: true })).toEqual(['age']);
    });

    it('a boolean or number counts as a value that makes an entry non-empty', () => {
        const subs: StageSubField[] = [
            { key: 'name', label: 'Name', type: 'text', required: true },
            { key: 'vegan', label: 'Vegan', type: 'boolean' },
        ];
        expect(entryMissingSubFields(subs, { vegan: false })).toEqual(['name']);
    });

    it('the core companions group: the nameless +1 with an allergy is a gap on that entry', () => {
        const values = { isAttending: true, companions: [{ name: 'Ben' }, { allergies: 'peanuts' }, {}] };
        expect(stageAnswerGaps(core(), values))
            .toEqual([{ kind: 'subField', key: 'companions', entry: 1, subField: 'name' }]);
        expect(stageAnswersComplete(core(), values)).toBe(false);
        expect(stageAnswersComplete(core(), { isAttending: true, companions: [{ name: 'Ben' }, {}] }))
            .toBe(true);
    });

    it('a companion gap no longer counts once attendance is No (the group is cut)', () => {
        expect(stageAnswersComplete(core(), { isAttending: false, companions: [{ allergies: 'x' }] }))
            .toBe(true);
    });

    it('a required group needs at least one entry that holds a value', () => {
        const elements: StageElement[] = [{ key: 'kids', label: 'Kids', type: 'repeatingGroup',
            required: true, subFields: COMPANION_SUBS }];
        expect(stageAnswerGaps(elements, {})).toEqual([{ kind: 'unanswered', key: 'kids' }]);
        expect(stageAnswerGaps(elements, { kids: [] })).toEqual([{ kind: 'unanswered', key: 'kids' }]);
        expect(stageAnswerGaps(elements, { kids: [{}] })).toEqual([{ kind: 'unanswered', key: 'kids' }]);
        expect(stageAnswersComplete(elements, { kids: [{ name: 'Mia' }] })).toBe(true);
    });

    it('malformed group values never throw: non-arrays and non-object entries hold nothing', () => {
        const elements: StageElement[] = [{ key: 'kids', label: 'Kids', type: 'repeatingGroup',
            subFields: COMPANION_SUBS }];
        expect(stageAnswersComplete(elements, { kids: 'junk' })).toBe(true);
        expect(stageAnswersComplete(elements, { kids: [null, 'x', 3, ['a']] })).toBe(true);
        expect(entryMissingSubFields(undefined, { name: 'x' })).toEqual([]);
    });
});

describe('visibleStageElements (the renderer and the helper share it)', () => {
    it('drops adminOnly and unrevealed questions, then cuts after a No on the core gate', () => {
        const keys = (els: StageElement[]) => els.map((el) => ('key' in el ? el.key : el.id));
        expect(keys(visibleStageElements(DEFAULT_CORE_STAGE.elements as unknown as StageElement[], {})))
            .toEqual(['isAttending', 'hasFoodRestrictions', 'companions']);
        expect(keys(visibleStageElements(core(), { isAttending: true, hasFoodRestrictions: true })))
            .toEqual(['isAttending', 'hasFoodRestrictions', 'foodRestrictionsText', 'companions']);
        expect(keys(visibleStageElements(core(), { isAttending: false }))).toEqual(['isAttending']);
    });
});
