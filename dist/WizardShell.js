"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.WizardShell = void 0;
const jsx_runtime_1 = require("react/jsx-runtime");
const React = __importStar(require("react"));
const Box_1 = __importDefault(require("@mui/material/Box"));
const Button_1 = __importDefault(require("@mui/material/Button"));
const LinearProgress_1 = __importDefault(require("@mui/material/LinearProgress"));
const Typography_1 = __importDefault(require("@mui/material/Typography"));
const WizardShell = ({ steps, finish }) => {
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
    return ((0, jsx_runtime_1.jsxs)(Box_1.default, { children: [(0, jsx_runtime_1.jsxs)(Box_1.default, { sx: { mb: 2 }, children: [(0, jsx_runtime_1.jsxs)(Typography_1.default, { variant: "caption", color: "text.secondary", children: [i + 1, " of ", steps.length] }), (0, jsx_runtime_1.jsx)(LinearProgress_1.default, { variant: "determinate", value: ((i + 1) / steps.length) * 100, sx: { mt: 0.5, height: 3, borderRadius: 3 } })] }), (0, jsx_runtime_1.jsx)(Box_1.default, { children: step.content }, step.key), (0, jsx_runtime_1.jsxs)(Box_1.default, { sx: { display: 'flex', justifyContent: 'flex-end', gap: 1, mt: 2 }, children: [i > 0 && ((0, jsx_runtime_1.jsx)(Button_1.default, { variant: "outlined", onClick: () => setIndex(i - 1), children: "Back" })), !last && ((0, jsx_runtime_1.jsx)(Button_1.default, { variant: "contained", disabled: step.canProceed === false, onClick: () => setIndex(i + 1), children: "Next" })), last && finish] })] }));
};
exports.WizardShell = WizardShell;
