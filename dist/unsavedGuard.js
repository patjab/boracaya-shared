"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.useUnsavedGuard = exports.UnsavedGuardContext = void 0;
const react_1 = __importDefault(require("react"));
exports.UnsavedGuardContext = react_1.default.createContext({
    register: () => () => { },
});
/** Register `dirty` with the shell's navigation guard for this editor's lifetime.
 *  The registered getter reads a ref kept current every render, so the shell
 *  always sees the latest dirty value — registering `() => dirty` in an effect
 *  instead would leave a post-paint window where a just-flipped dirty flag is
 *  still reported false and navigation slips past the guard (Copilot on #190). */
const useUnsavedGuard = (dirty) => {
    const { register } = react_1.default.useContext(exports.UnsavedGuardContext);
    const dirtyRef = react_1.default.useRef(dirty);
    dirtyRef.current = dirty;
    react_1.default.useEffect(() => register(() => dirtyRef.current), [register]);
};
exports.useUnsavedGuard = useUnsavedGuard;
