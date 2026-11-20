import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
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
import { isDisplayBlock } from './stages.js';
import { entryMissingSubFields, isRevealed, questionAnswerGaps, visibleStageElements } from './stageAnswers.js';
import { WizardShell } from './WizardShell.js';
/** cdk#1011: a repeating group renders its entries as bordered mini-forms —
 *  each sub-field reuses the same input vocabulary via a pseudo-question, so
 *  a group's inputs look exactly like top-level ones. The default server cap
 *  mirrors here so the Add button quietly stops at the bound. */
const DEFAULT_MAX_ENTRIES = 20;
const labelFor = (question, messages) => {
    if (!question.required || messages.requiredIndicator.length === 0)
        return question.label;
    return `${question.label} ${messages.requiredIndicator}`;
};
const requiredInputProps = (required) => (required ? { required: true, 'aria-required': true } : {});
const requiredGroupLabelFor = (question, messages) => question.required
    ? `${question.label} ${messages.requiredFieldLabel}`
    : question.label;
/** The first input of an entry: its sub-fields' native inputs or MUI's
 *  combobox, then a Yes/No pill — never the entry's own ✕ button. */
const ENTRY_FOCUS_TARGET = 'input:not([aria-hidden]), textarea:not([aria-hidden]), [role="combobox"], :scope [role="group"] button';
const RepeatingGroupInput = ({ f, value, onChange, messages }) => {
    var _a, _b, _c;
    const entries = Array.isArray(value)
        ? value.filter((e) => typeof e === 'object' && e !== null && !Array.isArray(e))
        : [];
    const subFields = (_a = f.subFields) !== null && _a !== void 0 ? _a : [];
    const max = (_b = f.maxEntries) !== null && _b !== void 0 ? _b : DEFAULT_MAX_ENTRIES;
    // Entries carry no identity, so the group keeps a parallel list of local
    // ids (shore#571): a Remove drops its own id, so the boxes after it keep
    // their DOM (and focus) instead of shifting onto a neighbour's entry. A
    // new entry or a value replaced from outside (a draft restore) just tops
    // up or trims the list.
    const nextId = React.useRef(0);
    const ids = React.useRef([]);
    while (ids.current.length < entries.length)
        ids.current.push(`${f.key}-${nextId.current++}`);
    ids.current.length = entries.length;
    // shore#571: after Add/Remove, focus moves to an entry's first input
    // (else the Add button) once the consumer's state brings the new entry
    // count back — never left on a button that unmounted.
    const list = React.useRef(null);
    const addButton = React.useRef(null);
    const pendingFocus = React.useRef(null);
    React.useEffect(() => {
        var _a, _b, _c, _d;
        const pending = pendingFocus.current;
        if ((pending === null || pending === void 0 ? void 0 : pending.count) !== entries.length)
            return;
        pendingFocus.current = null;
        (_d = ((_c = (_b = (_a = list.current) === null || _a === void 0 ? void 0 : _a.children[pending.entry]) === null || _b === void 0 ? void 0 : _b.querySelector(ENTRY_FOCUS_TARGET)) !== null && _c !== void 0 ? _c : addButton.current)) === null || _d === void 0 ? void 0 : _d.focus();
    });
    const setEntries = (next, entry) => {
        pendingFocus.current = { entry, count: next.length };
        onChange(f.key, next);
    };
    // The entry that slid into the removed slot, else the one before, else Add.
    const remove = (i) => {
        ids.current.splice(i, 1);
        setEntries(entries.filter((_, j) => j !== i), i < entries.length - 1 ? i : i - 1);
    };
    const add = () => setEntries([...entries, {}], entries.length);
    const missingByEntry = entries.map((entry) => entryMissingSubFields(subFields, entry));
    return (_jsxs(Box, { role: "group", "aria-label": requiredGroupLabelFor(f, messages), sx: { mt: 2, mb: 1 }, children: [_jsx(Typography, { variant: "body2", sx: { mb: 0.75 }, children: labelFor(f, messages) }), _jsx(Stack, { ref: list, spacing: 1.5, children: entries.map((entry, i) => {
                    const id = ids.current[i];
                    return (_jsxs(Box, { sx: { border: 1, borderColor: 'divider', borderRadius: 2, p: 1.5, position: 'relative' }, children: [_jsx(IconButton, { size: "small", "aria-label": messages.formatRemoveEntryActionLabel({
                                    fieldLabel: f.label,
                                    entryNumber: i + 1,
                                }), onClick: () => remove(i), sx: { position: 'absolute', top: 4, right: 4 }, children: "\u2715" }), subFields.map((sub) => questionInput({ ...sub, key: `${id}.${sub.key}` }, entry[sub.key], (_k, v) => onChange(f.key, entries.map((e, j) => (j === i ? { ...e, [sub.key]: v } : e))), messages,
                            // shore#704: a required sub-field left empty in an
                            // entry that holds other answers says so inline.
                            missingByEntry[i].includes(sub.key)))] }, id));
                }) }), entries.length < max && (_jsx(Button, { ref: addButton, size: "small", variant: "outlined", sx: { mt: 1 }, onClick: add, children: (_c = f.addLabel) !== null && _c !== void 0 ? _c : messages.addEntryActionLabel }))] }));
};
const parseList = (text) => text.split(',').map((v) => v.trim()).filter(Boolean);
const sameList = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
/** A list of short strings (e.g. companions), edited comma-separated — the
 *  server bounds items/length (cdk#518). The parsed array is reported on every
 *  keystroke, but the input shows the guest's own text while they type
 *  (shore#475): rebuilding it from `join(', ')` ate each trailing comma and
 *  space the moment it was typed. The text tidies to `a, b` on blur, and a
 *  value that changes from outside (a draft restore, a prefill) shows as is. */
const ListInput = ({ f, value, onChange, messages }) => {
    const items = Array.isArray(value) ? value : [];
    const [draft, setDraft] = React.useState(null);
    const text = draft !== null && sameList(parseList(draft), items) ? draft : items.join(', ');
    return (_jsx(TextField, { fullWidth: true, margin: "normal", label: labelFor(f, messages), placeholder: f.placeholder, helperText: messages.listSeparatorHint, slotProps: { htmlInput: requiredInputProps(f.required) }, value: text, onChange: (e) => {
            setDraft(e.target.value);
            onChange(f.key, parseList(e.target.value));
        }, onBlur: () => setDraft(null) }));
};
/** The inline-error props of a TextField-backed input (shore#704): marked
 *  invalid, with the consumer's reason as its helper text when it has one. */
const errorProps = (error, messages) => (error ? { error: true, helperText: messages.requiredSubFieldMessage } : {});
/** The id of a non-TextField input's inline error text (keys are unique per entry). */
const errorIdFor = (key) => `stage-${key}-error`;
const questionInput = (f, value, onChange, messages, error = false) => {
    var _a, _b;
    const errorText = error && messages.requiredSubFieldMessage ? messages.requiredSubFieldMessage : undefined;
    switch (f.type) {
        case 'repeatingGroup':
            return _jsx(RepeatingGroupInput, { f: f, value: value, onChange: onChange, messages: messages }, f.key);
        case 'list':
            return _jsx(ListInput, { f: f, value: value, onChange: onChange, messages: messages }, f.key);
        case 'boolean':
            // A themed Yes/No pill, not a checkbox — hosts phrase booleans as
            // questions, and the pill picks up the app theme's ToggleButton
            // styling (cdk#976).
            return (_jsxs(Box, { sx: { mt: 2, mb: 1 }, children: [_jsx(Typography, { variant: "body2", sx: { mb: 0.75 }, children: labelFor(f, messages) }), _jsxs(ToggleButtonGroup, { exclusive: true, size: "small", "aria-label": requiredGroupLabelFor(f, messages), "aria-describedby": errorText ? errorIdFor(f.key) : undefined, "aria-invalid": error || undefined, value: value === true ? 'yes' : value === false ? 'no' : null, onChange: (_, v) => { if (v !== null)
                            onChange(f.key, v === 'yes'); }, sx: {
                            // MUI's default unselected secondary text can miss
                            // 4.5:1 by a few hundredths on generated palettes.
                            '& .MuiToggleButton-root:not(.Mui-selected)': { color: 'text.primary' },
                        }, children: [_jsx(ToggleButton, { value: "yes", children: messages.yesOptionLabel }), _jsx(ToggleButton, { value: "no", children: messages.noOptionLabel })] }), errorText && (_jsx(Typography, { id: errorIdFor(f.key), variant: "caption", color: "error", sx: { display: 'block', mt: 0.5 }, children: errorText }))] }, f.key));
        case 'select':
            return (_jsxs(FormControl, { fullWidth: true, margin: "normal", error: error, children: [_jsx(InputLabel, { id: `stage-${f.key}`, children: labelFor(f, messages) }), _jsx(Select, { labelId: `stage-${f.key}`, label: labelFor(f, messages), required: f.required,
                        // The combobox names its inline reason (MUI 6/7/9 all
                        // take SelectDisplayProps); `error` above sets aria-invalid.
                        SelectDisplayProps: errorText ? { 'aria-describedby': errorIdFor(f.key) } : undefined, value: typeof value === 'string' ? value : '', onChange: (e) => onChange(f.key, e.target.value), children: ((_a = f.options) !== null && _a !== void 0 ? _a : []).map((o) => (_jsx(MenuItem, { value: o, children: o }, o))) }), errorText && _jsx(FormHelperText, { id: errorIdFor(f.key), children: errorText })] }, f.key));
        case 'number':
            // shore#716: without a step the browser applies step=1, so 2.5
            // nights or shoe size 8.5 fail native validation inside a <form>;
            // the stages Lambda stores decimals.
            return (_jsx(TextField, { fullWidth: true, margin: "normal", type: "number", label: labelFor(f, messages), placeholder: f.placeholder, ...errorProps(error, messages), slotProps: {
                    htmlInput: { step: 'any', inputMode: 'decimal', ...requiredInputProps(f.required) },
                }, value: value !== null && value !== void 0 ? value : '', onChange: (e) => onChange(f.key, e.target.value === '' ? '' : Number(e.target.value)) }, f.key));
        case 'date':
            return (_jsx(TextField, { fullWidth: true, margin: "normal", type: "date", label: labelFor(f, messages), ...errorProps(error, messages), slotProps: {
                    inputLabel: { shrink: true },
                    htmlInput: requiredInputProps(f.required),
                }, value: value !== null && value !== void 0 ? value : '', onChange: (e) => onChange(f.key, e.target.value) }, f.key));
        default: // text | multiline
            return (_jsx(TextField, { fullWidth: true, margin: "normal", label: labelFor(f, messages), placeholder: f.placeholder, multiline: f.type === 'multiline', minRows: f.type === 'multiline' ? 3 : undefined, ...errorProps(error, messages), slotProps: {
                    htmlInput: {
                        maxLength: (_b = f.maxLength) !== null && _b !== void 0 ? _b : 500,
                        ...requiredInputProps(f.required),
                    },
                }, value: value !== null && value !== void 0 ? value : '', onChange: (e) => onChange(f.key, e.target.value) }, f.key));
    }
};
const blockLabel = (label) => (_jsx(Typography, { variant: "overline", sx: { display: 'block', color: 'primary.main', lineHeight: 1.8 }, children: label }));
/** A display block's showable value: host text verbatim; sourced values from
 * `resolved` — undefined (hide the block) when the source resolved to
 * nothing. */
const blockValue = (b, resolved) => {
    if (typeof b.text === 'string' && b.text.trim())
        return [b.text];
    const v = b.source ? resolved === null || resolved === void 0 ? void 0 : resolved[b.id] : undefined;
    if (Array.isArray(v)) {
        const items = v.map((x) => String(x)).filter((s) => s.trim());
        return items.length ? items : undefined;
    }
    if (v === undefined || v === '')
        return undefined;
    return [String(v)];
};
const initialOf = (name) => name.trim().charAt(0).toUpperCase() || '·';
const displayBlock = (b, resolved) => {
    var _a;
    const value = blockValue(b, resolved);
    if (value === undefined)
        return null;
    const presentation = (_a = b.presentation) !== null && _a !== void 0 ? _a : (typeof b.text === 'string' ? 'note' : 'line');
    if (presentation === 'roster') {
        return (_jsxs(Box, { sx: { mt: 2, mb: 1 }, children: [b.label ? blockLabel(b.label) : null, _jsx(Stack, { spacing: 0.75, sx: { mt: 0.5 }, children: value.map((name, i) => (_jsxs(Stack, { direction: "row", spacing: 1, sx: { alignItems: 'center' }, children: [_jsx(Avatar, { sx: {
                                    width: 26, height: 26, fontSize: '0.8rem',
                                    bgcolor: 'transparent', color: 'primary.main',
                                    border: '1px solid', borderColor: 'primary.main',
                                }, children: initialOf(name) }), _jsx(Typography, { variant: "body1", children: name })] }, `${b.id}-${i}`))) })] }, b.id));
    }
    if (presentation === 'note') {
        return (_jsxs(Box, { sx: { mt: 2, mb: 1 }, children: [b.label ? blockLabel(b.label) : null, _jsx(Typography, { variant: "body2", color: "text.secondary", sx: { fontStyle: 'italic' }, children: value.join(' · ') })] }, b.id));
    }
    return (_jsxs(Box, { sx: { mt: 2, mb: 1 }, children: [b.label ? blockLabel(b.label) : null, _jsx(Typography, { variant: "body1", children: value.join(' · ') })] }, b.id));
};
const keyOf = (el) => (isDisplayBlock(el) ? el.id : el.key);
export const StageFormRenderer = ({ elements, values, onChange, resolved, presentation, footer, messages, }) => {
    const all = elements !== null && elements !== void 0 ? elements : [];
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
    const rows = [];
    for (const el of list) {
        const prev = rows[rows.length - 1];
        if (!isDisplayBlock(el) && el.sameRow && prev && !isDisplayBlock(prev[0]))
            prev.push(el);
        else
            rows.push([el]);
    }
    const rendered = (el) => (isDisplayBlock(el)
        ? displayBlock(el, resolved)
        : questionInput(el, values[el.key], onChange, messages));
    const renderRow = (row) => (row.length === 1 ? rendered(row[0]) : (_jsx(Stack, { direction: { xs: 'column', sm: 'row' }, spacing: { xs: 0, sm: 2 }, sx: { alignItems: 'flex-start' }, children: row.map((el) => (_jsx(Box, { sx: { flex: 1, minWidth: 0, width: '100%' }, children: rendered(el) }, keyOf(el)))) }, row.map(keyOf).join('+'))));
    if (presentation === 'stepped' && rows.length > 0) {
        // One row per screen: a hidden display block (value resolved to
        // nothing) must not leave a blank screen, so empty interstitials are
        // dropped from the step list rather than rendered as dead stops.
        const steps = rows
            .filter((row) => !(isDisplayBlock(row[0]) && displayBlock(row[0], resolved) === null))
            .map((row) => ({
            key: row.map(keyOf).join('+'),
            content: renderRow(row),
            // The shared completeness rule (shore#686, shore#704): the same
            // one a consumer's submit asks through stageAnswersComplete.
            canProceed: row.every((el) => isDisplayBlock(el) || questionAnswerGaps(el, values[el.key]).length === 0),
        }));
        return _jsx(WizardShell, { steps: steps, finish: footer, messages: messages.wizard });
    }
    return (_jsxs(_Fragment, { children: [rows.map(renderRow), footer] }));
};
