import * as React from 'react';
import Checkbox from '@mui/material/Checkbox';
import FormControl from '@mui/material/FormControl';
import FormControlLabel from '@mui/material/FormControlLabel';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import TextField from '@mui/material/TextField';

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

const fieldInput = (
    f: RendererField,
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
                    helperText="Separate entries with commas"
                    value={Array.isArray(value) ? value.join(', ') : ''}
                    onChange={(e) => onChange(f.key,
                        e.target.value.split(',').map((v) => v.trim()).filter(Boolean))}
                />
            );
        case 'boolean':
            return (
                <FormControlLabel
                    key={f.key}
                    control={<Checkbox checked={value === true}
                                       onChange={(e) => onChange(f.key, e.target.checked)} />}
                    label={f.label}
                />
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
                    multiline={f.type === 'multiline'}
                    minRows={f.type === 'multiline' ? 3 : undefined}
                    inputProps={{ maxLength: f.maxLength ?? 500 }}
                    value={value ?? ''}
                    onChange={(e) => onChange(f.key, e.target.value)}
                />
            );
    }
};

/** Renders a stage definition's guest-visible fields as controlled inputs.
 *  adminOnly fields are filtered here (cdk#529) so no consumer can forget. */
export const StageFormRenderer = ({ fields, values, onChange }: {
    fields: ReadonlyArray<RendererField>;
    values: StageFormValues;
    onChange: (key: string, value: StageFormValue) => void;
}): React.ReactElement => (
    <>
        {fields.filter((f) => !f.adminOnly).map((f) => fieldInput(f, values[f.key], onChange))}
    </>
);
