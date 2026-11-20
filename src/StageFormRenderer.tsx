import * as React from 'react';
import Avatar from '@mui/material/Avatar';
import Box from '@mui/material/Box';
import FormControl from '@mui/material/FormControl';
import FormHelperText from '@mui/material/FormHelperText';
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
import { entryMissingSubFields, isRevealed, questionAnswerGaps, visibleStageElements } from './stageAnswers';
import { WizardShell } from './WizardShell';
import type { WizardStep } from './WizardShell';
import type { StageFormRendererMessages } from './formMessages';

/**
 * The ONE schema-driven stage-form renderer (cdk#961/#962/#976): Shore renders
 * the guest's real form with it, and Valet's stage editor embeds the same
 * component as its live preview — one implementation, so the preview cannot
 * drift from the guest experience (the #961 drift-killer decision). Since
 * cdk#976 a stage is an ordered mix of two element kinds: questions (asked and
 * saved) and display blocks (shown, not asked — values arrive server-resolved
 * via `resolved`). Data fetching/submission stay with the consumers. MUI is a
 * peer dependency, and only APIs stable across v6, v7 and v9 are used here: native
 * input attributes go through TextField `slotProps` (v9 removed `inputProps` /
 * `InputLabelProps`), and layout styles go through `sx` (v9 removed the system
 * props such as `alignItems` on Stack/Box/Typography/Grid) — shore#592.
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

const labelFor = (
    question: Pick<StageQuestion, 'label' | 'required'>,
    messages: StageFormRendererMessages,
): string => {
    if (!question.required || messages.requiredIndicator.length === 0) return question.label;
    return `${question.label} ${messages.requiredIndicator}`;
};

const requiredInputProps = (required: boolean | undefined): Record<string, boolean> =>
    (required ? { required: true, 'aria-required': true } : {});

const requiredGroupLabelFor = (
    question: Pick<StageQuestion, 'label' | 'required'>,
    messages: StageFormRendererMessages,
): string => question.required
    ? `${question.label} ${messages.requiredFieldLabel}`
    : question.label;

/** The first input of an entry: its sub-fields' native inputs or MUI's
 *  combobox, then a Yes/No pill — never the entry's own ✕ button. */
const ENTRY_FOCUS_TARGET =
    'input:not([aria-hidden]), textarea:not([aria-hidden]), [role="combobox"], :scope [role="group"] button';

const RepeatingGroupInput = ({ f, value, onChange, messages }: {
    f: StageQuestion;
    value: StageFormValue | undefined;
    onChange: (key: string, value: StageFormValue) => void;
    messages: StageFormRendererMessages;
}) => {
    const entries: RepeatingGroupEntry[] = Array.isArray(value)
        ? (value as RepeatingGroupEntry[]).filter((e): e is RepeatingGroupEntry =>
            typeof e === 'object' && e !== null && !Array.isArray(e))
        : [];
    const subFields = f.subFields ?? [];
    const max = f.maxEntries ?? DEFAULT_MAX_ENTRIES;
    // Entries carry no identity, so the group keeps a parallel list of local
    // ids (shore#571): a Remove drops its own id, so the boxes after it keep
    // their DOM (and focus) instead of shifting onto a neighbour's entry. A
    // new entry or a value replaced from outside (a draft restore) just tops
    // up or trims the list.
    const nextId = React.useRef(0);
    const ids = React.useRef<string[]>([]);
    while (ids.current.length < entries.length) ids.current.push(`${f.key}-${nextId.current++}`);
    ids.current.length = entries.length;
    // shore#571: after Add/Remove, focus moves to an entry's first input
    // (else the Add button) once the consumer's state brings the new entry
    // count back — never left on a button that unmounted.
    const list = React.useRef<HTMLDivElement>(null);
    const addButton = React.useRef<HTMLButtonElement>(null);
    const pendingFocus = React.useRef<{ entry: number; count: number } | null>(null);
    React.useEffect(() => {
        const pending = pendingFocus.current;
        if (pending?.count !== entries.length) return;
        pendingFocus.current = null;
        (list.current?.children[pending.entry]?.querySelector<HTMLElement>(ENTRY_FOCUS_TARGET)
            ?? addButton.current)?.focus();
    });
    const setEntries = (next: RepeatingGroupEntry[], entry: number) => {
        pendingFocus.current = { entry, count: next.length };
        onChange(f.key, next);
    };
    // The entry that slid into the removed slot, else the one before, else Add.
    const remove = (i: number) => {
        ids.current.splice(i, 1);
        setEntries(entries.filter((_, j) => j !== i), i < entries.length - 1 ? i : i - 1);
    };
    const add = () => setEntries([...entries, {}], entries.length);
    const missingByEntry = entries.map((entry) => entryMissingSubFields(subFields, entry));
    return (
        <Box
            role="group"
            aria-label={requiredGroupLabelFor(f, messages)}
            sx={{ mt: 2, mb: 1 }}
        >
            <Typography variant="body2" sx={{ mb: 0.75 }}>
                {labelFor(f, messages)}
            </Typography>
            <Stack ref={list} spacing={1.5}>
                {entries.map((entry, i) => {
                    const id = ids.current[i];
                    return (
                        <Box
                            key={id}
                            sx={{ border: 1, borderColor: 'divider', borderRadius: 2, p: 1.5, position: 'relative' }}
                        >
                            <IconButton
                                size="small"
                                aria-label={messages.formatRemoveEntryActionLabel({
                                    fieldLabel: f.label,
                                    entryNumber: i + 1,
                                })}
                                onClick={() => remove(i)}
                                sx={{ position: 'absolute', top: 4, right: 4 }}
                            >
                                ✕
                            </IconButton>
                            {subFields.map((sub: StageSubField) => questionInput(
                                { ...sub, key: `${id}.${sub.key}` } as StageQuestion,
                                entry[sub.key],
                                (_k, v) => onChange(f.key, entries.map((e, j) =>
                                    (j === i ? { ...e, [sub.key]: v as string | number | boolean } : e))),
                                messages,
                                // shore#704: a required sub-field left empty in an
                                // entry that holds other answers says so inline.
                                missingByEntry[i].includes(sub.key),
                            ))}
                        </Box>
                    );
                })}
            </Stack>
            {entries.length < max && (
                <Button ref={addButton} size="small" variant="outlined" sx={{ mt: 1 }} onClick={add}>
                    {f.addLabel ?? messages.addEntryActionLabel}
                </Button>
            )}
        </Box>
    );
};

const parseList = (text: string): string[] =>
    text.split(',').map((v) => v.trim()).filter(Boolean);

const sameList = (a: readonly string[], b: readonly string[]): boolean =>
    a.length === b.length && a.every((v, i) => v === b[i]);

/** A list of short strings (e.g. companions), edited comma-separated — the
 *  server bounds items/length (cdk#518). The parsed array is reported on every
 *  keystroke, but the input shows the guest's own text while they type
 *  (shore#475): rebuilding it from `join(', ')` ate each trailing comma and
 *  space the moment it was typed. The text tidies to `a, b` on blur, and a
 *  value that changes from outside (a draft restore, a prefill) shows as is. */
const ListInput = ({ f, value, onChange, messages }: {
    f: StageQuestion;
    value: StageFormValue | undefined;
    onChange: (key: string, value: StageFormValue) => void;
    messages: StageFormRendererMessages;
}) => {
    const items = Array.isArray(value) ? (value as string[]) : [];
    const [draft, setDraft] = React.useState<string | null>(null);
    const text = draft !== null && sameList(parseList(draft), items) ? draft : items.join(', ');
    return (
        <TextField
            fullWidth margin="normal"
            label={labelFor(f, messages)}
            placeholder={f.placeholder}
            helperText={messages.listSeparatorHint}
            slotProps={{ htmlInput: requiredInputProps(f.required) }}
            value={text}
            onChange={(e) => {
                setDraft(e.target.value);
                onChange(f.key, parseList(e.target.value));
            }}
            onBlur={() => setDraft(null)}
        />
    );
};

/** The inline-error props of a TextField-backed input (shore#704): marked
 *  invalid, with the consumer's reason as its helper text when it has one. */
const errorProps = (error: boolean, messages: StageFormRendererMessages) =>
    (error ? { error: true, helperText: messages.requiredSubFieldMessage } : {});

/** The id of a non-TextField input's inline error text (keys are unique per entry). */
const errorIdFor = (key: string): string => `stage-${key}-error`;

const questionInput = (
    f: StageQuestion,
    value: StageFormValue | undefined,
    onChange: (key: string, value: StageFormValue) => void,
    messages: StageFormRendererMessages,
    error = false,
) => {
    const errorText = error && messages.requiredSubFieldMessage ? messages.requiredSubFieldMessage : undefined;
    switch (f.type) {
        case 'repeatingGroup':
            return <RepeatingGroupInput key={f.key} f={f} value={value} onChange={onChange} messages={messages} />;
        case 'list':
            return <ListInput key={f.key} f={f} value={value} onChange={onChange} messages={messages} />;
        case 'boolean':
            // A themed Yes/No pill, not a checkbox — hosts phrase booleans as
            // questions, and the pill picks up the app theme's ToggleButton
            // styling (cdk#976).
            return (
                <Box key={f.key} sx={{ mt: 2, mb: 1 }}>
                    <Typography variant="body2" sx={{ mb: 0.75 }}>
                        {labelFor(f, messages)}
                    </Typography>
                    <ToggleButtonGroup
                        exclusive size="small" aria-label={requiredGroupLabelFor(f, messages)}
                        aria-describedby={errorText ? errorIdFor(f.key) : undefined}
                        value={value === true ? 'yes' : value === false ? 'no' : null}
                        onChange={(_, v) => { if (v !== null) onChange(f.key, v === 'yes'); }}
                        sx={{
                            // MUI's default unselected secondary text can miss
                            // 4.5:1 by a few hundredths on generated palettes.
                            '& .MuiToggleButton-root:not(.Mui-selected)': { color: 'text.primary' },
                        }}
                    >
                        <ToggleButton value="yes">{messages.yesOptionLabel}</ToggleButton>
                        <ToggleButton value="no">{messages.noOptionLabel}</ToggleButton>
                    </ToggleButtonGroup>
                    {errorText && (
                        <Typography id={errorIdFor(f.key)} variant="caption" color="error"
                            sx={{ display: 'block', mt: 0.5 }}>
                            {errorText}
                        </Typography>
                    )}
                </Box>
            );
        case 'select':
            return (
                <FormControl key={f.key} fullWidth margin="normal" error={error}>
                    <InputLabel id={`stage-${f.key}`}>{labelFor(f, messages)}</InputLabel>
                    <Select
                        labelId={`stage-${f.key}`}
                        label={labelFor(f, messages)}
                        required={f.required}
                        value={typeof value === 'string' ? value : ''}
                        onChange={(e) => onChange(f.key, e.target.value as string)}
                    >
                        {(f.options ?? []).map((o) => (
                            <MenuItem key={o} value={o}>{o}</MenuItem>
                        ))}
                    </Select>
                    {errorText && <FormHelperText id={errorIdFor(f.key)}>{errorText}</FormHelperText>}
                </FormControl>
            );
        case 'number':
            // shore#716: without a step the browser applies step=1, so 2.5
            // nights or shoe size 8.5 fail native validation inside a <form>;
            // the stages Lambda stores decimals.
            return (
                <TextField
                    key={f.key} fullWidth margin="normal" type="number"
                    label={labelFor(f, messages)}
                    placeholder={f.placeholder}
                    {...errorProps(error, messages)}
                    slotProps={{
                        htmlInput: { step: 'any', inputMode: 'decimal', ...requiredInputProps(f.required) },
                    }}
                    value={value ?? ''}
                    onChange={(e) => onChange(f.key, e.target.value === '' ? '' : Number(e.target.value))}
                />
            );
        case 'date':
            return (
                <TextField
                    key={f.key} fullWidth margin="normal" type="date"
                    label={labelFor(f, messages)}
                    {...errorProps(error, messages)}
                    slotProps={{
                        inputLabel: { shrink: true },
                        htmlInput: requiredInputProps(f.required),
                    }}
                    value={value ?? ''}
                    onChange={(e) => onChange(f.key, e.target.value)}
                />
            );
        default: // text | multiline
            return (
                <TextField
                    key={f.key} fullWidth margin="normal"
                    label={labelFor(f, messages)}
                    placeholder={f.placeholder}
                    multiline={f.type === 'multiline'}
                    minRows={f.type === 'multiline' ? 3 : undefined}
                    {...errorProps(error, messages)}
                    slotProps={{
                        htmlInput: {
                            maxLength: f.maxLength ?? 500,
                            ...requiredInputProps(f.required),
                        },
                    }}
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
                        <Stack key={`${b.id}-${i}`} direction="row" spacing={1} sx={{ alignItems: 'center' }}>
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
export interface StageFormRendererProps {
    /** The ordered stage elements (cdk#976). The legacy `fields` prop is
     *  retired with the stored shape (cdk#2132). */
    elements?: ReadonlyArray<StageElement>;
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
    /** All renderer-owned UI copy. Stage-authored labels/options stay in the schema. */
    messages: StageFormRendererMessages;
}

export const StageFormRenderer = ({
    elements,
    values,
    onChange,
    resolved,
    presentation,
    footer,
    messages,
}: StageFormRendererProps): React.ReactElement => {
    const all = elements ?? [];
    // A question hidden by an unmet reveal condition must not submit a stale
    // answer (typed, then the trigger flipped): clear it once it hides (cdk#1204).
    React.useEffect(() => {
        all.forEach((el) => {
            if (!isDisplayBlock(el) && el.revealWhen && !isRevealed(el, values)
                && values[el.key] !== undefined && values[el.key] !== '') {
                onChange(el.key, '');
            }
        });
    }, [elements, values, onChange]);
    // What the guest sees: adminOnly and unrevealed questions dropped, the
    // list cut after a "No" on the core gate (cdk#529, cdk#1204, cdk#1015).
    const list = visibleStageElements(all, values);
    const rows: StageElement[][] = [];
    for (const el of list) {
        const prev = rows[rows.length - 1];
        if (!isDisplayBlock(el) && el.sameRow && prev && !isDisplayBlock(prev[0])) prev.push(el);
        else rows.push([el]);
    }
    const rendered = (el: StageElement) => (isDisplayBlock(el)
        ? displayBlock(el, resolved)
        : questionInput(el, values[el.key], onChange, messages));
    const renderRow = (row: StageElement[]) => (row.length === 1 ? rendered(row[0]) : (
        <Stack
            key={row.map(keyOf).join('+')}
            direction={{ xs: 'column', sm: 'row' }}
            spacing={{ xs: 0, sm: 2 }}
            sx={{ alignItems: 'flex-start' }}
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
                // The shared completeness rule (shore#686, shore#704): the same
                // one a consumer's submit asks through stageAnswersComplete.
                canProceed: row.every((el) =>
                    isDisplayBlock(el) || questionAnswerGaps(el, values[el.key]).length === 0),
            }));
        return <WizardShell steps={steps} finish={footer} messages={messages.wizard} />;
    }

    return (
        <>
            {rows.map(renderRow)}
            {footer}
        </>
    );
};
