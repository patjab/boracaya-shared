import * as React from 'react';
/**
 * The platform's ONE stepped-form shell (cdk#1010, decision cdk#1009 A5): a
 * consumer-agnostic wizard over an ordered list of steps. The stage renderer's
 * stepped presentation rides it, and bespoke wizards (CreateEventWizard, the
 * retiring RSVPForm) are its intended later adopters — steps are just
 * {content, canProceed}, nothing stage- or event-creation-specific lives here.
 *
 * Behavior contract:
 *  - One step's content on screen at a time; Back walks left (hidden on the
 *    first step — never a trap, never a dead button).
 *  - Next is disabled while the current step says canProceed=false (per-step
 *    validation lives with the step, not the shell).
 *  - The FINAL step renders `finish` in Next's place — the consumer's own
 *    submit control, so submission stays with the consumer (the shell is
 *    presentation only, the #961 renderer rule).
 *  - Quiet progress: "N of M" + a thin determinate bar. No step names in the
 *    chrome — the content names itself.
 *  - The step index resets when the step LIST identity changes length — a
 *    definition edit mid-flight (Valet live preview) must not strand the
 *    wizard past the end.
 */
export interface WizardStep {
    /** Stable key (question key / block id). */
    key: string;
    content: React.ReactNode;
    /** false disables Next for this step. Absent = true. */
    canProceed?: boolean;
}
export declare const WizardShell: ({ steps, finish }: {
    steps: ReadonlyArray<WizardStep>;
    /** Rendered in Next's place on the final step (the consumer's submit). */
    finish?: React.ReactNode;
}) => React.ReactElement | null;
