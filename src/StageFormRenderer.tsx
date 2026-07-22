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
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import { isDisplayBlock } from './stages';
import type {
    DisplayPresentation, RepeatingGroupEntry, StageDisplayBlock, StageElement,
    StagePresentation, StageQuestion, StageSubField,
} from './stages';
import { WizardShell } from './WizardShell';
import type { WizardStep } from './WizardShell';

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

export type StageFormValue = string | number | boolean | string[] | RepeatingGroupEntry[];
export type StageFormValues = Record<string, StageFormValue>;

/** cdk#1011: a repeating group renders its entries as bordered mini-forms —
 *  each sub-field reuses the same input vocabulary via a pseudo-question, so
 *  a group's inputs look exactly like top-level ones. The default server cap
 *  mirrors here so the Add button quietly stops at the bound. */
const DEFAULT_MAX_ENTRIES = 20;

const repeatingGroupInput = (
    f: StageQuestion,
    value: StageFormValue | undefined,
    onChange: (key: string, value: StageFormValue) => void,
) => {
    const entries: RepeatingGroupEntry[] = Array.isArray(value)
        ? (value as RepeatingGroupEntry[]).filter((e): e is RepeatingGroupEntry =>
            typeof e === 'object' && e !== null && !Array.isArray(e))
        : [];
    const subFields = f.subFields ?? [];
    const max = f.maxEntries ?? DEFAULT_MAX_ENTRIES;
    const setEntries = (next: RepeatingGroupEntry[]) => onChange(f.key, next);
    return (
        <Box key={f.key} sx={{ mt: 2, mb: 1 }}>
            <Typography variant="body2" sx={{ mb: 0.75 }}>
                {f.label}{f.required ? ' *' : ''}
            </Typography>
            <Stack spacing={1.5}>
                {entries.map((entry, i) => (
                    <Box
                        // Positional keys are correct here: entries carry no
                        // identity, and remove rebuilds the array.
                        // eslint-disable-next-line react/no-array-index-key
                        key={`${f.key}-${i}`}
                        sx={{ border: 1, borderColor: 'divider', borderRadius: 2, p: 1.5, position: 'relative' }}
                    >
                        <IconButton
                            size="small"
                            aria-label={`Remove ${f.label} entry ${i + 1}`}
                            onClick={() => setEntries(entries.filter((_, j) => j !== i))}
                            sx={{ position: 'absolute', top: 4, right: 4 }}
                        >
                            ✕
                        </IconButton>
                        {subFields.map((sub: StageSubField) => questionInput(
                            { ...sub, key: `${f.key}.${i}.${sub.key}` } as StageQuestion,
                            entry[sub.key],
                            (_k, v) => setEntries(entries.map((e, j) =>
                                (j === i ? { ...e, [sub.key]: v as string | number | boolean } : e))),
                        ))}
                    </Box>
                ))}
            </Stack>
            {entries.length < max && (
                <Button size="small" variant="outlined" sx={{ mt: 1 }}
                        onClick={() => setEntries([...entries, {}])}>
                    {f.addLabel ?? 'Add another'}
                </Button>
            )}
        </Box>
    );
};

const questionInput = (
    f: StageQuestion,
    value: StageFormValue | undefined,
    onChange: (key: string, value: StageFormValue) => void,
) => {
    switch (f.type) {
        case 'repeatingGroup':
            return repeatingGroupInput(f, value, onChange);
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
/** A required question is "answered" when it holds a real value — false and 0
 *  count (a declined boolean IS an answer); '' , [] and undefined do not. */
const answered = (q: StageQuestion, v: StageFormValue | undefined): boolean =>
    !q.required || (Array.isArray(v) ? v.length > 0 : v !== undefined && v !== '');
// (A required repeatingGroup follows the same array rule: at least one entry.)

/** cdk#1015: the core gate. The machine-fixed boolean core question (cdk#1012)
 *  ends the form when the answer is "No" — everything after it never renders,
 *  in both presentations, so the consumer's footer (its submit control)
 *  surfaces immediately. Generic engine behavior keyed off the `core` marker:
 *  nothing here knows the stage is the RSVP. Unanswered leaves the full form
 *  (a required gate already blocks stepped progress until answered). */
const gateTruncated = (
    list: StageElement[],
    values: StageFormValues,
): StageElement[] => {
    const at = list.findIndex((el) =>
        !isDisplayBlock(el) && el.core === true && el.type === 'boolean');
    if (at === -1 || values[(list[at] as StageQuestion).key] !== false) return list;
    return list.slice(0, at + 1);
};

/** cdk#1204: a `revealWhen` question is shown only while its trigger answer
 *  matches — a follow-up field (the food-restriction detail) is meaningless
 *  until the guest flags restrictions. A display block has no reveal. */
const isRevealed = (el: StageElement, values: StageFormValues): boolean =>
    isDisplayBlock(el) || !el.revealWhen || values[el.revealWhen.key] === el.revealWhen.equals;

export const StageFormRenderer = ({ elements, fields, values, onChange, resolved, presentation, footer }: {
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
}): React.ReactElement => {
    const all = elements ?? fields ?? [];
    // A question hidden by an unmet reveal condition must not submit a stale
    // answer (typed, then the trigger flipped): clear it once it hides (cdk#1204).
    React.useEffect(() => {
        all.forEach((el) => {
            if (!isDisplayBlock(el) && el.revealWhen && !isRevealed(el, values)
                && values[el.key] !== undefined && values[el.key] !== '') {
                onChange(el.key, '');
            }
        });
    }, [elements, fields, values, onChange]);
    const list = gateTruncated(
        all.filter((el) => (isDisplayBlock(el) || !el.adminOnly) && isRevealed(el, values)),
        values,
    );
    const rows: StageElement[][] = [];
    for (const el of list) {
        const prev = rows[rows.length - 1];
        if (!isDisplayBlock(el) && el.sameRow && prev && !isDisplayBlock(prev[0])) prev.push(el);
        else rows.push([el]);
    }
    const rendered = (el: StageElement) => (isDisplayBlock(el)
        ? displayBlock(el, resolved)
        : questionInput(el, values[el.key], onChange));
    const renderRow = (row: StageElement[]) => (row.length === 1 ? rendered(row[0]) : (
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
    ));

    if (presentation === 'stepped' && rows.length > 0) {
        // One row per screen: a hidden display block (value resolved to
        // nothing) must not leave a blank screen, so empty interstitials are
        // dropped from the step list rather than rendered as dead stops.
        const steps: WizardStep[] = rows
            .filter((row) => !(isDisplayBlock(row[0]) && displayBlock(row[0], resolved) === null))
            .map((row) => ({
                key: row.map(keyOf).join('+'),
                content: renderRow(row),
                canProceed: row.every((el) =>
                    isDisplayBlock(el) || answered(el, values[el.key])),
            }));
        return <WizardShell steps={steps} finish={footer} />;
    }

    return (
        <>
            {rows.map(renderRow)}
            {footer}
        </>
    );
};
