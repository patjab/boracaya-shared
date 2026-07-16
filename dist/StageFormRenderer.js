"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.StageFormRenderer = void 0;
const jsx_runtime_1 = require("react/jsx-runtime");
const Checkbox_1 = __importDefault(require("@mui/material/Checkbox"));
const FormControl_1 = __importDefault(require("@mui/material/FormControl"));
const FormControlLabel_1 = __importDefault(require("@mui/material/FormControlLabel"));
const InputLabel_1 = __importDefault(require("@mui/material/InputLabel"));
const MenuItem_1 = __importDefault(require("@mui/material/MenuItem"));
const Select_1 = __importDefault(require("@mui/material/Select"));
const TextField_1 = __importDefault(require("@mui/material/TextField"));
const fieldInput = (f, value, onChange) => {
    var _a, _b;
    switch (f.type) {
        case 'list':
            // A list of short strings (e.g. companions), edited comma-separated —
            // the server bounds items/length (cdk#518).
            return ((0, jsx_runtime_1.jsx)(TextField_1.default, { fullWidth: true, margin: "normal", label: f.label, required: f.required, helperText: "Separate entries with commas", value: Array.isArray(value) ? value.join(', ') : '', onChange: (e) => onChange(f.key, e.target.value.split(',').map((v) => v.trim()).filter(Boolean)) }, f.key));
        case 'boolean':
            return ((0, jsx_runtime_1.jsx)(FormControlLabel_1.default, { control: (0, jsx_runtime_1.jsx)(Checkbox_1.default, { checked: value === true, onChange: (e) => onChange(f.key, e.target.checked) }), label: f.label }, f.key));
        case 'select':
            return ((0, jsx_runtime_1.jsxs)(FormControl_1.default, { fullWidth: true, margin: "normal", required: f.required, children: [(0, jsx_runtime_1.jsx)(InputLabel_1.default, { id: `stage-${f.key}`, children: f.label }), (0, jsx_runtime_1.jsx)(Select_1.default, { labelId: `stage-${f.key}`, label: f.label, value: typeof value === 'string' ? value : '', onChange: (e) => onChange(f.key, e.target.value), children: ((_a = f.options) !== null && _a !== void 0 ? _a : []).map((o) => ((0, jsx_runtime_1.jsx)(MenuItem_1.default, { value: o, children: o }, o))) })] }, f.key));
        case 'number':
            return ((0, jsx_runtime_1.jsx)(TextField_1.default, { fullWidth: true, margin: "normal", type: "number", label: f.label, required: f.required, value: value !== null && value !== void 0 ? value : '', onChange: (e) => onChange(f.key, e.target.value === '' ? '' : Number(e.target.value)) }, f.key));
        case 'date':
            return ((0, jsx_runtime_1.jsx)(TextField_1.default, { fullWidth: true, margin: "normal", type: "date", label: f.label, required: f.required, InputLabelProps: { shrink: true }, value: value !== null && value !== void 0 ? value : '', onChange: (e) => onChange(f.key, e.target.value) }, f.key));
        default: // text | multiline
            return ((0, jsx_runtime_1.jsx)(TextField_1.default, { fullWidth: true, margin: "normal", label: f.label, required: f.required, multiline: f.type === 'multiline', minRows: f.type === 'multiline' ? 3 : undefined, inputProps: { maxLength: (_b = f.maxLength) !== null && _b !== void 0 ? _b : 500 }, value: value !== null && value !== void 0 ? value : '', onChange: (e) => onChange(f.key, e.target.value) }, f.key));
    }
};
/** Renders a stage definition's guest-visible fields as controlled inputs.
 *  adminOnly fields are filtered here (cdk#529) so no consumer can forget. */
const StageFormRenderer = ({ fields, values, onChange }) => ((0, jsx_runtime_1.jsx)(jsx_runtime_1.Fragment, { children: fields.filter((f) => !f.adminOnly).map((f) => fieldInput(f, values[f.key], onChange)) }));
exports.StageFormRenderer = StageFormRenderer;
