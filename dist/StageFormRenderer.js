"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.StageFormRenderer = void 0;
const jsx_runtime_1 = require("react/jsx-runtime");
const Avatar_1 = __importDefault(require("@mui/material/Avatar"));
const Box_1 = __importDefault(require("@mui/material/Box"));
const FormControl_1 = __importDefault(require("@mui/material/FormControl"));
const InputLabel_1 = __importDefault(require("@mui/material/InputLabel"));
const MenuItem_1 = __importDefault(require("@mui/material/MenuItem"));
const Select_1 = __importDefault(require("@mui/material/Select"));
const Stack_1 = __importDefault(require("@mui/material/Stack"));
const TextField_1 = __importDefault(require("@mui/material/TextField"));
const ToggleButton_1 = __importDefault(require("@mui/material/ToggleButton"));
const ToggleButtonGroup_1 = __importDefault(require("@mui/material/ToggleButtonGroup"));
const Typography_1 = __importDefault(require("@mui/material/Typography"));
const Button_1 = __importDefault(require("@mui/material/Button"));
const IconButton_1 = __importDefault(require("@mui/material/IconButton"));
const stages_1 = require("./stages");
const WizardShell_1 = require("./WizardShell");
/** cdk#1011: a repeating group renders its entries as bordered mini-forms —
 *  each sub-field reuses the same input vocabulary via a pseudo-question, so
 *  a group's inputs look exactly like top-level ones. The default server cap
 *  mirrors here so the Add button quietly stops at the bound. */
const DEFAULT_MAX_ENTRIES = 20;
const repeatingGroupInput = (f, value, onChange) => {
    var _a, _b, _c;
    const entries = Array.isArray(value)
        ? value.filter((e) => typeof e === 'object' && e !== null && !Array.isArray(e))
        : [];
    const subFields = (_a = f.subFields) !== null && _a !== void 0 ? _a : [];
    const max = (_b = f.maxEntries) !== null && _b !== void 0 ? _b : DEFAULT_MAX_ENTRIES;
    const setEntries = (next) => onChange(f.key, next);
    return ((0, jsx_runtime_1.jsxs)(Box_1.default, { sx: { mt: 2, mb: 1 }, children: [(0, jsx_runtime_1.jsxs)(Typography_1.default, { variant: "body2", sx: { mb: 0.75 }, children: [f.label, f.required ? ' *' : ''] }), (0, jsx_runtime_1.jsx)(Stack_1.default, { spacing: 1.5, children: entries.map((entry, i) => ((0, jsx_runtime_1.jsxs)(Box_1.default
                // Positional keys are correct here: entries carry no
                // identity, and remove rebuilds the array.
                // eslint-disable-next-line react/no-array-index-key
                , { sx: { border: 1, borderColor: 'divider', borderRadius: 2, p: 1.5, position: 'relative' }, children: [(0, jsx_runtime_1.jsx)(IconButton_1.default, { size: "small", "aria-label": `Remove ${f.label} entry ${i + 1}`, onClick: () => setEntries(entries.filter((_, j) => j !== i)), sx: { position: 'absolute', top: 4, right: 4 }, children: "\u2715" }), subFields.map((sub) => questionInput({ ...sub, key: `${f.key}.${i}.${sub.key}` }, entry[sub.key], (_k, v) => setEntries(entries.map((e, j) => (j === i ? { ...e, [sub.key]: v } : e)))))] }, `${f.key}-${i}`))) }), entries.length < max && ((0, jsx_runtime_1.jsx)(Button_1.default, { size: "small", variant: "outlined", sx: { mt: 1 }, onClick: () => setEntries([...entries, {}]), children: (_c = f.addLabel) !== null && _c !== void 0 ? _c : 'Add another' }))] }, f.key));
};
const questionInput = (f, value, onChange) => {
    var _a, _b;
    switch (f.type) {
        case 'repeatingGroup':
            return repeatingGroupInput(f, value, onChange);
        case 'list':
            // A list of short strings (e.g. companions), edited comma-separated —
            // the server bounds items/length (cdk#518).
            return ((0, jsx_runtime_1.jsx)(TextField_1.default, { fullWidth: true, margin: "normal", label: f.label, required: f.required, placeholder: f.placeholder, helperText: "Separate entries with commas", value: Array.isArray(value) ? value.join(', ') : '', onChange: (e) => onChange(f.key, e.target.value.split(',').map((v) => v.trim()).filter(Boolean)) }, f.key));
        case 'boolean':
            // A themed Yes/No pill, not a checkbox — hosts phrase booleans as
            // questions, and the pill picks up the app theme's ToggleButton
            // styling (cdk#976).
            return ((0, jsx_runtime_1.jsxs)(Box_1.default, { sx: { mt: 2, mb: 1 }, children: [(0, jsx_runtime_1.jsxs)(Typography_1.default, { variant: "body2", sx: { mb: 0.75 }, children: [f.label, f.required ? ' *' : ''] }), (0, jsx_runtime_1.jsxs)(ToggleButtonGroup_1.default, { exclusive: true, size: "small", "aria-label": f.label, value: value === true ? 'yes' : value === false ? 'no' : null, onChange: (_, v) => { if (v !== null)
                            onChange(f.key, v === 'yes'); }, children: [(0, jsx_runtime_1.jsx)(ToggleButton_1.default, { value: "yes", children: "Yes" }), (0, jsx_runtime_1.jsx)(ToggleButton_1.default, { value: "no", children: "No" })] })] }, f.key));
        case 'select':
            return ((0, jsx_runtime_1.jsxs)(FormControl_1.default, { fullWidth: true, margin: "normal", required: f.required, children: [(0, jsx_runtime_1.jsx)(InputLabel_1.default, { id: `stage-${f.key}`, children: f.label }), (0, jsx_runtime_1.jsx)(Select_1.default, { labelId: `stage-${f.key}`, label: f.label, value: typeof value === 'string' ? value : '', onChange: (e) => onChange(f.key, e.target.value), children: ((_a = f.options) !== null && _a !== void 0 ? _a : []).map((o) => ((0, jsx_runtime_1.jsx)(MenuItem_1.default, { value: o, children: o }, o))) })] }, f.key));
        case 'number':
            return ((0, jsx_runtime_1.jsx)(TextField_1.default, { fullWidth: true, margin: "normal", type: "number", label: f.label, required: f.required, placeholder: f.placeholder, value: value !== null && value !== void 0 ? value : '', onChange: (e) => onChange(f.key, e.target.value === '' ? '' : Number(e.target.value)) }, f.key));
        case 'date':
            return ((0, jsx_runtime_1.jsx)(TextField_1.default, { fullWidth: true, margin: "normal", type: "date", label: f.label, required: f.required, InputLabelProps: { shrink: true }, value: value !== null && value !== void 0 ? value : '', onChange: (e) => onChange(f.key, e.target.value) }, f.key));
        default: // text | multiline
            return ((0, jsx_runtime_1.jsx)(TextField_1.default, { fullWidth: true, margin: "normal", label: f.label, required: f.required, placeholder: f.placeholder, multiline: f.type === 'multiline', minRows: f.type === 'multiline' ? 3 : undefined, inputProps: { maxLength: (_b = f.maxLength) !== null && _b !== void 0 ? _b : 500 }, value: value !== null && value !== void 0 ? value : '', onChange: (e) => onChange(f.key, e.target.value) }, f.key));
    }
};
const blockLabel = (label) => ((0, jsx_runtime_1.jsx)(Typography_1.default, { variant: "overline", sx: { display: 'block', color: 'primary.main', lineHeight: 1.8 }, children: label }));
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
        return ((0, jsx_runtime_1.jsxs)(Box_1.default, { sx: { mt: 2, mb: 1 }, children: [b.label ? blockLabel(b.label) : null, (0, jsx_runtime_1.jsx)(Stack_1.default, { spacing: 0.75, sx: { mt: 0.5 }, children: value.map((name, i) => ((0, jsx_runtime_1.jsxs)(Stack_1.default, { direction: "row", spacing: 1, alignItems: "center", children: [(0, jsx_runtime_1.jsx)(Avatar_1.default, { sx: {
                                    width: 26, height: 26, fontSize: '0.8rem',
                                    bgcolor: 'transparent', color: 'primary.main',
                                    border: '1px solid', borderColor: 'primary.main',
                                }, children: initialOf(name) }), (0, jsx_runtime_1.jsx)(Typography_1.default, { variant: "body1", children: name })] }, `${b.id}-${i}`))) })] }, b.id));
    }
    if (presentation === 'note') {
        return ((0, jsx_runtime_1.jsxs)(Box_1.default, { sx: { mt: 2, mb: 1 }, children: [b.label ? blockLabel(b.label) : null, (0, jsx_runtime_1.jsx)(Typography_1.default, { variant: "body2", color: "text.secondary", sx: { fontStyle: 'italic' }, children: value.join(' · ') })] }, b.id));
    }
    return ((0, jsx_runtime_1.jsxs)(Box_1.default, { sx: { mt: 2, mb: 1 }, children: [b.label ? blockLabel(b.label) : null, (0, jsx_runtime_1.jsx)(Typography_1.default, { variant: "body1", children: value.join(' · ') })] }, b.id));
};
const keyOf = (el) => ((0, stages_1.isDisplayBlock)(el) ? el.id : el.key);
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
const StageFormRenderer = ({ elements, fields, values, onChange, resolved, presentation, footer }) => {
    var _a;
    const list = ((_a = elements !== null && elements !== void 0 ? elements : fields) !== null && _a !== void 0 ? _a : [])
        .filter((el) => (0, stages_1.isDisplayBlock)(el) || !el.adminOnly);
    const rows = [];
    for (const el of list) {
        const prev = rows[rows.length - 1];
        if (!(0, stages_1.isDisplayBlock)(el) && el.sameRow && prev && !(0, stages_1.isDisplayBlock)(prev[0]))
            prev.push(el);
        else
            rows.push([el]);
    }
    const rendered = (el) => ((0, stages_1.isDisplayBlock)(el)
        ? displayBlock(el, resolved)
        : questionInput(el, values[el.key], onChange));
    const renderRow = (row) => (row.length === 1 ? rendered(row[0]) : ((0, jsx_runtime_1.jsx)(Stack_1.default, { direction: { xs: 'column', sm: 'row' }, spacing: { xs: 0, sm: 2 }, alignItems: "flex-start", children: row.map((el) => ((0, jsx_runtime_1.jsx)(Box_1.default, { sx: { flex: 1, minWidth: 0, width: '100%' }, children: rendered(el) }, keyOf(el)))) }, row.map(keyOf).join('+'))));
    if (presentation === 'stepped' && rows.length > 0) {
        // One row per screen: a hidden display block (value resolved to
        // nothing) must not leave a blank screen, so empty interstitials are
        // dropped from the step list rather than rendered as dead stops.
        const steps = rows
            .filter((row) => !((0, stages_1.isDisplayBlock)(row[0]) && displayBlock(row[0], resolved) === null))
            .map((row) => ({
            key: row.map(keyOf).join('+'),
            content: renderRow(row),
            canProceed: row.every((el) => (0, stages_1.isDisplayBlock)(el) || answered(el, values[el.key])),
        }));
        return (0, jsx_runtime_1.jsx)(WizardShell_1.WizardShell, { steps: steps, finish: footer });
    }
    return ((0, jsx_runtime_1.jsxs)(jsx_runtime_1.Fragment, { children: [rows.map(renderRow), footer] }));
};
exports.StageFormRenderer = StageFormRenderer;
