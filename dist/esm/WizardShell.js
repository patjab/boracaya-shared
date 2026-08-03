import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import * as React from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import LinearProgress from '@mui/material/LinearProgress';
import Typography from '@mui/material/Typography';
export const WizardShell = ({ steps, finish, messages }) => {
    const [index, setIndex] = React.useState(0);
    // Clamp, never strand: a shrinking step list (live preview edits, a
    // definition reload) pulls the wizard back to the new end.
    const max = Math.max(0, steps.length - 1);
    const i = Math.min(index, max);
    React.useEffect(() => {
        if (index > max)
            setIndex(max);
    }, [index, max]);
    if (steps.length === 0)
        return null;
    const step = steps[i];
    const last = i === max;
    const stepCountLabel = messages.formatStepCount({
        stepNumber: i + 1,
        stepCount: steps.length,
    });
    return (_jsxs(Box, { children: [_jsxs(Box, { sx: { mb: 2 }, children: [_jsx(Typography, { variant: "caption", color: "text.secondary", children: stepCountLabel }), _jsx(LinearProgress, { "aria-label": stepCountLabel, variant: "determinate", value: ((i + 1) / steps.length) * 100, sx: { mt: 0.5, height: 3, borderRadius: 3 } })] }), _jsx(Box, { children: step.content }, step.key), _jsxs(Box, { sx: { display: 'flex', justifyContent: 'flex-end', gap: 1, mt: 2 }, children: [i > 0 && (_jsx(Button, { variant: "outlined", onClick: () => setIndex(i - 1), children: messages.backActionLabel })), !last && (_jsx(Button, { variant: "contained", disabled: step.canProceed === false, onClick: () => {
                            if (step.validate && !step.validate())
                                return;
                            setIndex(i + 1);
                        }, children: messages.nextActionLabel })), last && finish] })] }));
};
