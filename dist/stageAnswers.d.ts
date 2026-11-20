import type { StageElement, StageQuestion, StageSubField } from './stages';
/** One reason a stage cannot be submitted yet. */
export type StageAnswerGap = 
/** A required question with no answer (a required group with no non-empty entry). */
{
    kind: 'unanswered';
    key: string;
}
/** Entry `entry` (0-based) of group `key` holds values but leaves required `subField` empty. */
 | {
    kind: 'subField';
    key: string;
    entry: number;
    subField: string;
};
type Values = Readonly<Record<string, unknown>>;
/** cdk#1204: a `revealWhen` question is shown only while its trigger answer
 *  matches. A display block has no reveal. (Module-internal: the renderer
 *  clears a hidden answer with it; not re-exported by any entry.) */
export declare const isRevealed: (el: StageElement, values: Values) => boolean;
/**
 * The elements a guest sees for these values, in order: adminOnly questions
 * (cdk#529) and questions whose `revealWhen` is unmet are dropped, then the
 * list ends after a "No" on the core gate. The renderer draws exactly this list.
 */
export declare const visibleStageElements: <T extends StageElement>(elements: ReadonlyArray<T>, values: Values) => T[];
/**
 * The keys of the required sub-fields left empty in one repeating-group entry,
 * in definition order. `required` is read from `subFields` (never a hard-coded
 * key). An entry that holds no value at all is complete: it is a row the guest
 * added and left blank, which consumers drop rather than send.
 */
export declare const entryMissingSubFields: (subFields: ReadonlyArray<StageSubField> | undefined, entry: unknown) => string[];
/** The gaps of one question with its current value (visibility is the caller's). */
export declare const questionAnswerGaps: (q: StageQuestion, value: unknown) => StageAnswerGap[];
/** Every reason the stage cannot be submitted with these values, in element order. */
export declare const stageAnswerGaps: (elements: ReadonlyArray<StageElement>, values: Values) => StageAnswerGap[];
/** True when the stage may be submitted: no gap among the questions the guest can see. */
export declare const stageAnswersComplete: (elements: ReadonlyArray<StageElement>, values: Values) => boolean;
export {};
