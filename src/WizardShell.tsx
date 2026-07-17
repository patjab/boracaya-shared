import * as React from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import LinearProgress from '@mui/material/LinearProgress';
import Typography from '@mui/material/Typography';

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

export const WizardShell = ({ steps, finish }: {
    steps: ReadonlyArray<WizardStep>;
    /** Rendered in Next's place on the final step (the consumer's submit). */
    finish?: React.ReactNode;
}): React.ReactElement | null => {
    const [index, setIndex] = React.useState(0);
    // Clamp, never strand: a shrinking step list (live preview edits, a
    // definition reload) pulls the wizard back to the new end.
    const max = Math.max(0, steps.length - 1);
    const i = Math.min(index, max);
    React.useEffect(() => {
        if (index > max) setIndex(max);
    }, [index, max]);

    if (steps.length === 0) return null;
    const step = steps[i];
    const last = i === max;

    return (
        <Box>
            <Box sx={{ mb: 2 }}>
                <Typography variant="caption" color="text.secondary">
                    {i + 1} of {steps.length}
                </Typography>
                <LinearProgress
                    variant="determinate"
                    value={((i + 1) / steps.length) * 100}
                    sx={{ mt: 0.5, height: 3, borderRadius: 3 }}
                />
            </Box>

            <Box key={step.key}>{step.content}</Box>

            <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1, mt: 2 }}>
                {i > 0 && (
                    <Button variant="outlined" onClick={() => setIndex(i - 1)}>
                        Back
                    </Button>
                )}
                {!last && (
                    <Button
                        variant="contained"
                        disabled={step.canProceed === false}
                        onClick={() => setIndex(i + 1)}
                    >
                        Next
                    </Button>
                )}
                {last && finish}
            </Box>
        </Box>
    );
};
