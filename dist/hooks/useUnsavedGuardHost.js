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
Object.defineProperty(exports, "__esModule", { value: true });
exports.useUnsavedGuardHost = void 0;
const React = __importStar(require("react"));
const browser_1 = require("../browser");
/**
 * The shell side of the navigation guard (#610): a mounted editor registers its
 * dirty-getter; any navigation that would leave it (tab/subtab switch, "Your
 * events", "Sign out") is intercepted with a confirm when there are unsaved
 * edits.
 *
 * A SET of getters, not a single slot (cdk#984): an editor can nest another
 * editor, so two guards can be live at once — each unregister removes only its
 * own getter, and navigation is dirty when ANY registrant says so.
 */
const useUnsavedGuardHost = () => {
    const dirtyGetters = React.useRef(new Set());
    const register = React.useCallback((isDirty) => {
        dirtyGetters.current.add(isDirty);
        return () => { dirtyGetters.current.delete(isDirty); };
    }, []);
    const guardValue = React.useMemo(() => ({ register }), [register]);
    const [pending, setPending] = React.useState(null);
    const guard = (action) => {
        if ([...dirtyGetters.current].some((isDirty) => isDirty()))
            setPending(() => action);
        else
            action();
    };
    const proceed = () => { const act = pending; setPending(null); act === null || act === void 0 ? void 0 : act(); };
    const stay = () => setPending(null);
    const anyDirty = React.useCallback(() => [...dirtyGetters.current].some((isDirty) => isDirty()), []);
    // Tab close / refresh / typed URL: the ONLY case a page cannot theme.
    // Browsers removed custom copy years ago (Chrome 2016, Firefox 2017) — a
    // page may trigger the native prompt and nothing more.
    React.useEffect(() => (0, browser_1.onBeforeUnload)(anyDirty), [anyDirty]);
    return { guardValue, guard, pending, proceed, stay };
};
exports.useUnsavedGuardHost = useUnsavedGuardHost;
