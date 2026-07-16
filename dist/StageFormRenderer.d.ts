import * as React from 'react';
/**
 * The ONE schema-driven stage-form renderer (cdk#961/#962): Shore renders the
 * guest's real form with it, and Valet's stage editor embeds the same component
 * as its live preview — one implementation, so the preview cannot drift from
 * the guest experience (the #961 drift-killer decision). Extracted verbatim
 * from Shore's StageForm fieldInput; data fetching/submission stay with the
 * consumers. MUI is a peer dependency (Shore v6 / Valet v7 — only cross-stable
 * APIs are used here).
 */
export interface RendererField {
    key: string;
    label: string;
    type: 'text' | 'multiline' | 'number' | 'boolean' | 'select' | 'date' | 'list';
    required?: boolean;
    options?: string[];
    maxLength?: number;
    adminOnly?: boolean;
    defaultFrom?: string;
}
export type StageFormValue = string | number | boolean | string[];
export type StageFormValues = Record<string, StageFormValue>;
/** Renders a stage definition's guest-visible fields as controlled inputs.
 *  adminOnly fields are filtered here (cdk#529) so no consumer can forget. */
export declare const StageFormRenderer: ({ fields, values, onChange }: {
    fields: ReadonlyArray<RendererField>;
    values: StageFormValues;
    onChange: (key: string, value: StageFormValue) => void;
}) => React.ReactElement;
