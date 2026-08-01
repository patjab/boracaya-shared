import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
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
import { isDisplayBlock } from './stages.js';
import { WizardShell } from './WizardShell.js';
/** cdk#1011: a repeating group renders its entries as bordered mini-forms —
 *  each sub-field reuses the same input vocabulary via a pseudo-question, so
 *  a group's inputs look exactly like top-level ones. The default server cap
 *  mirrors here so the Add button quietly stops at the bound. */
const DEFAULT_MAX_ENTRIES = 20;
const labelFor = (question, messages) => question.required
    ? `${question.label} ${messages.requiredIndicator}`
    : question.label;
const requiredInputProps = (required) => (required ? { required: true, 'aria-required': true } : {});
const repeatingGroupInput = (f, value, onChange, messages) => {
    var _a, _b, _c;
    const entries = Array.isArray(value)
        ? value.filter((e) => typeof e === 'object' && e !== null && !Array.isArray(e))
        : [];
    const subFields = (_a = f.subFields) !== null && _a !== void 0 ? _a : [];
    const max = (_b = f.maxEntries) !== null && _b !== void 0 ? _b : DEFAULT_MAX_ENTRIES;
    const setEntries = (next) => onChange(f.key, next);
    return (_jsxs(Box, { sx: { mt: 2, mb: 1 }, children: [_jsx(Typography, { variant: "body2", sx: { mb: 0.75 }, children: labelFor(f, messages) }), _jsx(Stack, { spacing: 1.5, children: entries.map((entry, i) => (_jsxs(Box
                // Positional keys are correct here: entries carry no
                // identity, and remove rebuilds the array.
                // eslint-disable-next-line react/no-array-index-key
                , { sx: { border: 1, borderColor: 'divider', borderRadius: 2, p: 1.5, position: 'relative' }, children: [_jsx(IconButton, { size: "small", "aria-label": messages.formatRemoveEntryActionLabel({
                                fieldLabel: f.label,
                                entryNumber: i + 1,
                            }), onClick: () => setEntries(entries.filter((_, j) => j !== i)), sx: { position: 'absolute', top: 4, right: 4 }, children: "\u2715" }), subFields.map((sub) => questionInput({ ...sub, key: `${f.key}.${i}.${sub.key}` }, entry[sub.key], (_k, v) => setEntries(entries.map((e, j) => (j === i ? { ...e, [sub.key]: v } : e))), messages))] }, `${f.key}-${i}`))) }), entries.length < max && (_jsx(Button, { size: "small", variant: "outlined", sx: { mt: 1 }, onClick: () => setEntries([...entries, {}]), children: (_c = f.addLabel) !== null && _c !== void 0 ? _c : messages.addEntryActionLabel }))] }, f.key));
};
const questionInput = (f, value, onChange, messages) => {
    var _a, _b;
    switch (f.type) {
        case 'repeatingGroup':
            return repeatingGroupInput(f, value, onChange, messages);
        case 'list':
            // A list of short strings (e.g. companions), edited comma-separated —
            // the server bounds items/length (cdk#518).
            return (_jsx(TextField, { fullWidth: true, margin: "normal", label: labelFor(f, messages), placeholder: f.placeholder, helperText: messages.listSeparatorHint, inputProps: requiredInputProps(f.required), value: Array.isArray(value) ? value.join(', ') : '', onChange: (e) => onChange(f.key, e.target.value.split(',').map((v) => v.trim()).filter(Boolean)) }, f.key));
        case 'boolean':
            // A themed Yes/No pill, not a checkbox — hosts phrase booleans as
            // questions, and the pill picks up the app theme's ToggleButton
            // styling (cdk#976).
            return (_jsxs(Box, { sx: { mt: 2, mb: 1 }, children: [_jsx(Typography, { variant: "body2", sx: { mb: 0.75 }, children: labelFor(f, messages) }), _jsxs(ToggleButtonGroup, { exclusive: true, size: "small", "aria-label": f.label, "aria-required": f.required || undefined, value: value === true ? 'yes' : value === false ? 'no' : null, onChange: (_, v) => { if (v !== null)
                            onChange(f.key, v === 'yes'); }, sx: {
                            // MUI's default unselected secondary text can miss
                            // 4.5:1 by a few hundredths on generated palettes.
                            '& .MuiToggleButton-root:not(.Mui-selected)': { color: 'text.primary' },
                        }, children: [_jsx(ToggleButton, { value: "yes", children: messages.yesOptionLabel }), _jsx(ToggleButton, { value: "no", children: messages.noOptionLabel })] })] }, f.key));
        case 'select':
            return (_jsxs(FormControl, { fullWidth: true, margin: "normal", children: [_jsx(InputLabel, { id: `stage-${f.key}`, children: labelFor(f, messages) }), _jsx(Select, { labelId: `stage-${f.key}`, label: labelFor(f, messages), required: f.required, value: typeof value === 'string' ? value : '', onChange: (e) => onChange(f.key, e.target.value), children: ((_a = f.options) !== null && _a !== void 0 ? _a : []).map((o) => (_jsx(MenuItem, { value: o, children: o }, o))) })] }, f.key));
        case 'number':
            return (_jsx(TextField, { fullWidth: true, margin: "normal", type: "number", label: labelFor(f, messages), placeholder: f.placeholder, inputProps: requiredInputProps(f.required), value: value !== null && value !== void 0 ? value : '', onChange: (e) => onChange(f.key, e.target.value === '' ? '' : Number(e.target.value)) }, f.key));
        case 'date':
            return (_jsx(TextField, { fullWidth: true, margin: "normal", type: "date", label: labelFor(f, messages), InputLabelProps: { shrink: true }, inputProps: requiredInputProps(f.required), value: value !== null && value !== void 0 ? value : '', onChange: (e) => onChange(f.key, e.target.value) }, f.key));
        default: // text | multiline
            return (_jsx(TextField, { fullWidth: true, margin: "normal", label: labelFor(f, messages), placeholder: f.placeholder, multiline: f.type === 'multiline', minRows: f.type === 'multiline' ? 3 : undefined, inputProps: {
                    maxLength: (_b = f.maxLength) !== null && _b !== void 0 ? _b : 500,
                    ...requiredInputProps(f.required),
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
        return (_jsxs(Box, { sx: { mt: 2, mb: 1 }, children: [b.label ? blockLabel(b.label) : null, _jsx(Stack, { spacing: 0.75, sx: { mt: 0.5 }, children: value.map((name, i) => (_jsxs(Stack, { direction: "row", spacing: 1, alignItems: "center", children: [_jsx(Avatar, { sx: {
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
const answered = (q, v) => !q.required || (Array.isArray(v) ? v.length > 0 : v !== undefined && v !== '');
// (A required repeatingGroup follows the same array rule: at least one entry.)
/** cdk#1015: the core gate. The machine-fixed boolean core question (cdk#1012)
 *  ends the form when the answer is "No" — everything after it never renders,
 *  in both presentations, so the consumer's footer (its submit control)
 *  surfaces immediately. Generic engine behavior keyed off the `core` marker:
 *  nothing here knows the stage is the RSVP. Unanswered leaves the full form
 *  (a required gate already blocks stepped progress until answered). */
const gateTruncated = (list, values) => {
    const at = list.findIndex((el) => !isDisplayBlock(el) && el.core === true && el.type === 'boolean');
    if (at === -1 || values[list[at].key] !== false)
        return list;
    return list.slice(0, at + 1);
};
/** cdk#1204: a `revealWhen` question is shown only while its trigger answer
 *  matches — a follow-up field (the food-restriction detail) is meaningless
 *  until the guest flags restrictions. A display block has no reveal. */
const isRevealed = (el, values) => isDisplayBlock(el) || !el.revealWhen || values[el.revealWhen.key] === el.revealWhen.equals;
export const StageFormRenderer = ({ elements, fields, values, onChange, resolved, presentation, footer, messages, }) => {
    var _a;
    const all = (_a = elements !== null && elements !== void 0 ? elements : fields) !== null && _a !== void 0 ? _a : [];
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
    const list = gateTruncated(all.filter((el) => (isDisplayBlock(el) || !el.adminOnly) && isRevealed(el, values)), values);
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
    const renderRow = (row) => (row.length === 1 ? rendered(row[0]) : (_jsx(Stack, { direction: { xs: 'column', sm: 'row' }, spacing: { xs: 0, sm: 2 }, alignItems: "flex-start", children: row.map((el) => (_jsx(Box, { sx: { flex: 1, minWidth: 0, width: '100%' }, children: rendered(el) }, keyOf(el)))) }, row.map(keyOf).join('+'))));
    if (presentation === 'stepped' && rows.length > 0) {
        // One row per screen: a hidden display block (value resolved to
        // nothing) must not leave a blank screen, so empty interstitials are
        // dropped from the step list rather than rendered as dead stops.
        const steps = rows
            .filter((row) => !(isDisplayBlock(row[0]) && displayBlock(row[0], resolved) === null))
            .map((row) => ({
            key: row.map(keyOf).join('+'),
            content: renderRow(row),
            canProceed: row.every((el) => isDisplayBlock(el) || answered(el, values[el.key])),
        }));
        return _jsx(WizardShell, { steps: steps, finish: footer, messages: messages.wizard });
    }
    return (_jsxs(_Fragment, { children: [rows.map(renderRow), footer] }));
};
