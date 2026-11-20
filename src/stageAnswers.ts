/**
 * Stage-answer completeness (shore#686, shore#704): the ONE rule for "may this
 * stage be submitted now". The renderer's stepped Next and a consumer's own
 * submit control ask the same question, so they cannot disagree.
 *
 * Plain TypeScript, no React: Shore's RSVP controller and the renderer both
 * import it. Values are typed loosely (`unknown`) because they come from a
 * form's state, a restored draft or a server seed, none of which is trusted.
 *
 * The rule, over the questions a guest can see NOW (`visibleStageElements`:
 * not adminOnly, revealed by their `revealWhen`, not cut off by a "No" on the
 * core gate; display blocks are never asked):
 *  - a required question needs a real value: `false` and `0` answer it,
 *    `''`, `[]`, `null` and `undefined` do not;
 *  - a repeating-group entry that holds any value must have every sub-field
 *    its definition marks `required` filled (a blank-only string is not
 *    filled). A completely empty entry is complete: consumers drop it;
 *  - a required repeating group needs at least one entry that holds a value.
 */
import { isDisplayBlock } from './stages';
import type { StageElement, StageQuestion, StageSubField } from './stages';

/** One reason a stage cannot be submitted yet. */
export type StageAnswerGap =
    /** A required question with no answer (a required group with no non-empty entry). */
    | { kind: 'unanswered'; key: string }
    /** Entry `entry` (0-based) of group `key` holds values but leaves required `subField` empty. */
    | { kind: 'subField'; key: string; entry: number; subField: string };

type Values = Readonly<Record<string, unknown>>;

/** cdk#1204: a `revealWhen` question is shown only while its trigger answer
 *  matches. A display block has no reveal. (Module-internal: the renderer
 *  clears a hidden answer with it; not re-exported by any entry.) */
export const isRevealed = (el: StageElement, values: Values): boolean =>
    isDisplayBlock(el) || !el.revealWhen || values[el.revealWhen.key] === el.revealWhen.equals;

/** cdk#1015: the core gate. The machine-fixed boolean core question ends the
 *  form when the answer is "No": everything after it is not shown, in both
 *  presentations. Unanswered leaves the full form. */
const gateTruncated = <T extends StageElement>(list: T[], values: Values): T[] => {
    const at = list.findIndex((el) =>
        !isDisplayBlock(el) && el.core === true && el.type === 'boolean');
    if (at === -1 || values[(list[at] as StageQuestion).key] !== false) return list;
    return list.slice(0, at + 1);
};

/**
 * The elements a guest sees for these values, in order: adminOnly questions
 * (cdk#529) and questions whose `revealWhen` is unmet are dropped, then the
 * list ends after a "No" on the core gate. The renderer draws exactly this list.
 */
export const visibleStageElements = <T extends StageElement>(
    elements: ReadonlyArray<T>,
    values: Values,
): T[] => gateTruncated(
    elements.filter((el) => (isDisplayBlock(el) || !el.adminOnly) && isRevealed(el, values)),
    values,
);

const isEntry = (e: unknown): e is Record<string, unknown> =>
    typeof e === 'object' && e !== null && !Array.isArray(e);

/** A sub-field value that counts as filled: a non-blank string, a finite
 *  number, or a boolean. */
const filled = (v: unknown): boolean => {
    if (typeof v === 'string') return v.trim() !== '';
    if (typeof v === 'number') return Number.isFinite(v);
    return typeof v === 'boolean';
};

const holdsValue = (entry: Record<string, unknown>): boolean => Object.values(entry).some(filled);

/**
 * The keys of the required sub-fields left empty in one repeating-group entry,
 * in definition order. `required` is read from `subFields` (never a hard-coded
 * key). An entry that holds no value at all is complete: it is a row the guest
 * added and left blank, which consumers drop rather than send.
 */
export const entryMissingSubFields = (
    subFields: ReadonlyArray<StageSubField> | undefined,
    entry: unknown,
): string[] => {
    if (!isEntry(entry) || !holdsValue(entry)) return [];
    return (subFields ?? []).filter((sf) => sf.required && !filled(entry[sf.key])).map((sf) => sf.key);
};

/** The gaps of one question with its current value (visibility is the caller's). */
export const questionAnswerGaps = (q: StageQuestion, value: unknown): StageAnswerGap[] => {
    if (q.type === 'repeatingGroup') {
        const entries = Array.isArray(value) ? value : [];
        const gaps: StageAnswerGap[] = [];
        if (q.required && !entries.some((e) => isEntry(e) && holdsValue(e))) {
            gaps.push({ kind: 'unanswered', key: q.key });
        }
        entries.forEach((entry, i) => {
            for (const subField of entryMissingSubFields(q.subFields, entry)) {
                gaps.push({ kind: 'subField', key: q.key, entry: i, subField });
            }
        });
        return gaps;
    }
    if (!q.required) return [];
    const answered = Array.isArray(value)
        ? value.length > 0
        : value !== undefined && value !== null && value !== '';
    return answered ? [] : [{ kind: 'unanswered', key: q.key }];
};

/** Every reason the stage cannot be submitted with these values, in element order. */
export const stageAnswerGaps = (
    elements: ReadonlyArray<StageElement>,
    values: Values,
): StageAnswerGap[] => {
    const gaps: StageAnswerGap[] = [];
    for (const el of visibleStageElements(elements, values)) {
        if (!isDisplayBlock(el)) gaps.push(...questionAnswerGaps(el, values[el.key]));
    }
    return gaps;
};

/** True when the stage may be submitted: no gap among the questions the guest can see. */
export const stageAnswersComplete = (
    elements: ReadonlyArray<StageElement>,
    values: Values,
): boolean => stageAnswerGaps(elements, values).length === 0;
