import * as React from 'react';
import type { StageElement, StageQuestion } from './stages';
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
/**
 * Renders a stage definition's guest-visible elements as controlled inputs and
 * read-only display blocks. adminOnly questions are filtered here (cdk#529) so
 * no consumer can forget. `elements` is the post-#976 ordered mix; `fields` is
 * the legacy questions-only alias and keeps pre-#976 consumers rendering
 * identically. Consecutive questions marked `sameRow` share a responsive row
 * (cdk#976). `resolved` carries server-resolved display-block values keyed by
 * block id (the guest GET `defaults` map; the Valet preview passes samples).
 */
export declare const StageFormRenderer: ({ elements, fields, values, onChange, resolved }: {
    elements?: ReadonlyArray<StageElement>;
    fields?: ReadonlyArray<RendererField>;
    values: StageFormValues;
    onChange: (key: string, value: StageFormValue) => void;
    resolved?: Readonly<StageFormValues>;
}) => React.ReactElement;
