import * as React from 'react';
import type { StageElement, StagePresentation, StageQuestion } from './stages';
/**
 * The ONE schema-driven stage-form renderer (cdk#961/#962/#976): Shore renders
 * the guest's real form with it, and Valet's stage editor embeds the same
 * component as its live preview — one implementation, so the preview cannot
 * drift from the guest experience (the #961 drift-killer decision). Since
 * cdk#976 a stage is an ordered mix of two element kinds: questions (asked and
 * saved) and display blocks (shown, not asked — values arrive server-resolved
 * via `resolved`). Data fetching/submission stay with the consumers. MUI is a
 * peer dependency (Shore v6 / Valet v7 — only cross-stable APIs are used
 * here).
 */
/** Legacy name for a question element (pre-#976 consumers). */
export type RendererField = StageQuestion;
export type StageFormValue = string | number | boolean | string[];
export type StageFormValues = Record<string, StageFormValue>;
export declare const StageFormRenderer: ({ elements, fields, values, onChange, resolved, presentation, footer }: {
    elements?: ReadonlyArray<StageElement>;
    fields?: ReadonlyArray<RendererField>;
    values: StageFormValues;
    onChange: (key: string, value: StageFormValue) => void;
    resolved?: Readonly<StageFormValues>;
    /** cdk#1010: 'stepped' walks the same ordered rows one screen at a time
     *  through the shared WizardShell (display-block rows become interstitial
     *  screens; a sameRow group stays one screen). Absent/'flat' renders the
     *  whole form — byte-identical to the pre-#1010 output. */
    presentation?: StagePresentation;
    /** The consumer's submit control: rendered AFTER the form in flat mode,
     *  and in Next's place on the final stepped screen — so submission stays
     *  with the consumer in both presentations. */
    footer?: React.ReactNode;
}) => React.ReactElement;
