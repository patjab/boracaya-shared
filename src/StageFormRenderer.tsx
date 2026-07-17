import * as React from 'react';
import Avatar from '@mui/material/Avatar';
import Box from '@mui/material/Box';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Typography from '@mui/material/Typography';
import { isDisplayBlock } from './stages';
import type {
    DisplayPresentation, StageDisplayBlock, StageElement, StageQuestion,
} from './stages';

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

const questionInput = (
    f: StageQuestion,
    value: StageFormValue | undefined,
    onChange: (key: string, value: StageFormValue) => void,
) => {
    switch (f.type) {
        case 'list':
            // A list of short strings (e.g. companions), edited comma-separated —
            // the server bounds items/length (cdk#518).
            return (
                <TextField
                    key={f.key} fullWidth margin="normal"
                    label={f.label} required={f.required}
                    placeholder={f.placeholder}
                    helperText="Separate entries with commas"
                    value={Array.isArray(value) ? value.join(', ') : ''}
                    onChange={(e) => onChange(f.key,
                        e.target.value.split(',').map((v) => v.trim()).filter(Boolean))}
                />
            );
        case 'boolean':
            // A themed Yes/No pill, not a checkbox — hosts phrase booleans as
            // questions, and the pill picks up the app theme's ToggleButton
            // styling (cdk#976).
            return (
                <Box key={f.key} sx={{ mt: 2, mb: 1 }}>
                    <Typography variant="body2" sx={{ mb: 0.75 }}>
                        {f.label}{f.required ? ' *' : ''}
                    </Typography>
                    <ToggleButtonGroup
                        exclusive size="small" aria-label={f.label}
                        value={value === true ? 'yes' : value === false ? 'no' : null}
                        onChange={(_, v) => { if (v !== null) onChange(f.key, v === 'yes'); }}
                    >
                        <ToggleButton value="yes">Yes</ToggleButton>
                        <ToggleButton value="no">No</ToggleButton>
                    </ToggleButtonGroup>
                </Box>
            );
        case 'select':
            return (
                <FormControl key={f.key} fullWidth margin="normal" required={f.required}>
                    <InputLabel id={`stage-${f.key}`}>{f.label}</InputLabel>
                    <Select
                        labelId={`stage-${f.key}`}
                        label={f.label}
                        value={typeof value === 'string' ? value : ''}
                        onChange={(e) => onChange(f.key, e.target.value as string)}
                    >
                        {(f.options ?? []).map((o) => (
                            <MenuItem key={o} value={o}>{o}</MenuItem>
                        ))}
                    </Select>
                </FormControl>
            );
        case 'number':
            return (
                <TextField
                    key={f.key} fullWidth margin="normal" type="number"
                    label={f.label} required={f.required}
                    placeholder={f.placeholder}
                    value={value ?? ''}
                    onChange={(e) => onChange(f.key, e.target.value === '' ? '' : Number(e.target.value))}
                />
            );
        case 'date':
            return (
                <TextField
                    key={f.key} fullWidth margin="normal" type="date"
                    label={f.label} required={f.required}
                    InputLabelProps={{ shrink: true }}
                    value={value ?? ''}
                    onChange={(e) => onChange(f.key, e.target.value)}
                />
            );
        default: // text | multiline
            return (
                <TextField
                    key={f.key} fullWidth margin="normal"
                    label={f.label} required={f.required}
                    placeholder={f.placeholder}
                    multiline={f.type === 'multiline'}
                    minRows={f.type === 'multiline' ? 3 : undefined}
                    inputProps={{ maxLength: f.maxLength ?? 500 }}
                    value={value ?? ''}
                    onChange={(e) => onChange(f.key, e.target.value)}
                />
            );
    }
};

const blockLabel = (label: string) => (
    <Typography variant="overline" sx={{ display: 'block', color: 'primary.main', lineHeight: 1.8 }}>
        {label}
    </Typography>
);

/** A display block's showable value: host text verbatim; sourced values from
 * `resolved` — undefined (hide the block) when the source resolved to
 * nothing. */
const blockValue = (
    b: StageDisplayBlock,
    resolved: Readonly<StageFormValues> | undefined,
): string[] | undefined => {
    if (typeof b.text === 'string' && b.text.trim()) return [b.text];
    const v = b.source ? resolved?.[b.id] : undefined;
    if (Array.isArray(v)) {
        const items = v.map((x) => String(x)).filter((s) => s.trim());
        return items.length ? items : undefined;
    }
    if (v === undefined || v === '') return undefined;
    return [String(v)];
};

const initialOf = (name: string): string => name.trim().charAt(0).toUpperCase() || '·';

const displayBlock = (
    b: StageDisplayBlock,
    resolved: Readonly<StageFormValues> | undefined,
): React.ReactElement | null => {
    const value = blockValue(b, resolved);
    if (value === undefined) return null;
    const presentation: DisplayPresentation =
        b.presentation ?? (typeof b.text === 'string' ? 'note' : 'line');
    if (presentation === 'roster') {
        return (
            <Box key={b.id} sx={{ mt: 2, mb: 1 }}>
                {b.label ? blockLabel(b.label) : null}
                <Stack spacing={0.75} sx={{ mt: 0.5 }}>
                    {value.map((name, i) => (
                        <Stack key={`${b.id}-${i}`} direction="row" spacing={1} alignItems="center">
                            <Avatar sx={{
                                width: 26, height: 26, fontSize: '0.8rem',
                                bgcolor: 'transparent', color: 'primary.main',
                                border: '1px solid', borderColor: 'primary.main',
                            }}>{initialOf(name)}</Avatar>
                            <Typography variant="body1">{name}</Typography>
                        </Stack>
                    ))}
                </Stack>
            </Box>
        );
    }
    if (presentation === 'note') {
        return (
            <Box key={b.id} sx={{ mt: 2, mb: 1 }}>
                {b.label ? blockLabel(b.label) : null}
                <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                    {value.join(' · ')}
                </Typography>
            </Box>
        );
    }
    return (
        <Box key={b.id} sx={{ mt: 2, mb: 1 }}>
            {b.label ? blockLabel(b.label) : null}
            <Typography variant="body1">{value.join(' · ')}</Typography>
        </Box>
    );
};

const keyOf = (el: StageElement): string => (isDisplayBlock(el) ? el.id : el.key);

/**
 * Renders a stage definition's guest-visible elements as controlled inputs and
 * read-only display blocks. adminOnly questions are filtered here (cdk#529) so
 * no consumer can forget. `elements` is the post-#976 ordered mix; `fields` is
 * the legacy questions-only alias and keeps pre-#976 consumers rendering
 * identically. Consecutive questions marked `sameRow` share a responsive row
 * (cdk#976). `resolved` carries server-resolved display-block values keyed by
 * block id (the guest GET `defaults` map; the Valet preview passes samples).
 */
export const StageFormRenderer = ({ elements, fields, values, onChange, resolved }: {
    elements?: ReadonlyArray<StageElement>;
    fields?: ReadonlyArray<RendererField>;
    values: StageFormValues;
    onChange: (key: string, value: StageFormValue) => void;
    resolved?: Readonly<StageFormValues>;
}): React.ReactElement => {
    const list = (elements ?? fields ?? [])
        .filter((el) => isDisplayBlock(el) || !el.adminOnly);
    const rows: StageElement[][] = [];
    for (const el of list) {
        const prev = rows[rows.length - 1];
        if (!isDisplayBlock(el) && el.sameRow && prev && !isDisplayBlock(prev[0])) prev.push(el);
        else rows.push([el]);
    }
    const rendered = (el: StageElement) => (isDisplayBlock(el)
        ? displayBlock(el, resolved)
        : questionInput(el, values[el.key], onChange));
    return (
        <>
            {rows.map((row) => (row.length === 1 ? rendered(row[0]) : (
                <Stack
                    key={row.map(keyOf).join('+')}
                    direction={{ xs: 'column', sm: 'row' }}
                    spacing={{ xs: 0, sm: 2 }}
                    alignItems="flex-start"
                >
                    {row.map((el) => (
                        <Box key={keyOf(el)} sx={{ flex: 1, minWidth: 0, width: '100%' }}>
                            {rendered(el)}
                        </Box>
                    ))}
                </Stack>
            )))}
        </>
    );
};
