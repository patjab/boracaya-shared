import * as React from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import LinearProgress from '@mui/material/LinearProgress';
import Typography from '@mui/material/Typography';
import type { WizardMessages } from './formMessages';

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
 *  - Back/Next move focus to the new step's content, and the "N of M" caption
 *    is a polite live region (shore#501): the pressed button often unmounts
 *    (Back on step 2, Next onto the final step), which dropped focus to
 *    <body>, and nothing told a screen-reader user the step changed. The
 *    caption is aria-live only, with no status role, so a consumer's own
 *    role="status" stays the only one. Only a press moves focus — never the
 *    first render, nor a clamp from a shrinking step list.
 */
export interface WizardStep {
    /** Stable key (question key / block id). */
    key: string;
    content: React.ReactNode;
    /** false disables Next for this step. Absent = true. */
    canProceed?: boolean;
    /** Click-time gate (cdk#1010, the CreateEventWizard idiom): called when
     *  Next is pressed; return false to STAY — set your own error state
     *  inside, the shell renders nothing. Next stays enabled, so validation
     *  can explain itself on click instead of a mute disabled button. Absent
     *  = advance freely. Composes with canProceed (checked first). */
    validate?: () => boolean;
}

export interface WizardShellProps {
    steps: ReadonlyArray<WizardStep>;
    /** Rendered in Next's place on the final step (the consumer's submit). */
    finish?: React.ReactNode;
    /** All consumer-visible navigation and progress copy. */
    messages: WizardMessages;
}

export const WizardShell = ({ steps, finish, messages }: WizardShellProps): React.ReactElement | null => {
    const [index, setIndex] = React.useState(0);
    const stepRef = React.useRef<HTMLDivElement>(null);
    const navigated = React.useRef(false);
    // Clamp, never strand: a shrinking step list (live preview edits, a
    // definition reload) pulls the wizard back to the new end.
    const max = Math.max(0, steps.length - 1);
    const i = Math.min(index, max);
    React.useEffect(() => {
        if (index > max) setIndex(max);
    }, [index, max]);
    React.useEffect(() => {
        if (!navigated.current) return;
        navigated.current = false;
        stepRef.current?.focus();
    }, [index]);
    const go = (next: number) => {
        navigated.current = true;
        setIndex(next);
    };

    if (steps.length === 0) return null;
    const step = steps[i];
    const last = i === max;
    const stepCountLabel = messages.formatStepCount({
        stepNumber: i + 1,
        stepCount: steps.length,
    });

    return (
        <Box>
            <Box sx={{ mb: 2 }}>
                <Typography variant="caption" color="text.secondary" aria-live="polite" aria-atomic="true">
                    {stepCountLabel}
                </Typography>
                <LinearProgress
                    aria-label={stepCountLabel}
                    variant="determinate"
                    value={((i + 1) / steps.length) * 100}
                    sx={{ mt: 0.5, height: 3, borderRadius: 3 }}
                />
            </Box>

            <Box key={step.key} ref={stepRef} tabIndex={-1}>{step.content}</Box>

            <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1, mt: 2 }}>
                {i > 0 && (
                    <Button variant="outlined" onClick={() => go(i - 1)}>
                        {messages.backActionLabel}
                    </Button>
                )}
                {!last && (
                    <Button
                        variant="contained"
                        disabled={step.canProceed === false}
                        onClick={() => {
                            if (step.validate && !step.validate()) return;
                            go(i + 1);
                        }}
                    >
                        {messages.nextActionLabel}
                    </Button>
                )}
                {last && finish}
            </Box>
        </Box>
    );
};
