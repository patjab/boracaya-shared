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
exports.GoogleSignInButton = GoogleSignInButton;
const React = __importStar(require("react"));
const auth_1 = require("./auth");
/** Delays before each automatic retry after a failed GIS load (shore#577). */
const RETRY_DELAYS_MS = [2000, 4000, 8000];
/**
 * Renders the official Google button. Kept outside the identity primitives so
 * API/client imports do not retain React UI code.
 *
 * When Google Identity Services cannot load (content blocker, filtered network,
 * offline), the button retries with increasing delays, then gives up: it calls
 * `onUnavailable` and renders `fallback` beside its empty slot. Each later
 * `online` event makes one more attempt; success removes the fallback.
 */
function GoogleSignInButton(props) {
    const ref = React.useRef(null);
    const [attempt, setAttempt] = React.useState(0);
    const [unavailable, setUnavailable] = React.useState(false);
    // Indexes RETRY_DELAYS_MS; a failure past its end gives up.
    const failures = React.useRef(0);
    const onUnavailable = React.useRef(props.onUnavailable);
    onUnavailable.current = props.onUnavailable;
    React.useEffect(() => {
        let cancelled = false;
        let retryTimer;
        (0, auth_1.initAuth)()
            .then(() => {
            if (cancelled)
                return;
            failures.current = 0;
            setUnavailable(false);
            if (!ref.current)
                return;
            (0, auth_1.renderGoogleSignInButton)(ref.current, props.text);
        })
            .catch(() => {
            var _a;
            // GIS failed to load/initialize (initAuth reset its memo, #1278): retry this
            // mount with backoff so a transient blip self-heals without a reload, but
            // stop after RETRY_DELAYS_MS so a blocked script is not re-fetched forever.
            if (cancelled)
                return;
            const delay = RETRY_DELAYS_MS[failures.current];
            failures.current += 1;
            if (delay !== undefined) {
                retryTimer = setTimeout(() => setAttempt((a) => a + 1), delay);
                return;
            }
            setUnavailable(true);
            (_a = onUnavailable.current) === null || _a === void 0 ? void 0 : _a.call(onUnavailable);
        });
        const onChange = () => { var _a; return (_a = props.onSignIn) === null || _a === void 0 ? void 0 : _a.call(props); };
        window.addEventListener('pdab-auth-change', onChange);
        return () => {
            cancelled = true;
            if (retryTimer !== undefined)
                clearTimeout(retryTimer);
            window.removeEventListener('pdab-auth-change', onChange);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [attempt]);
    React.useEffect(() => {
        if (!unavailable)
            return undefined;
        // One fresh attempt per reconnect; a failure there gives up again at once.
        const onOnline = () => {
            failures.current = RETRY_DELAYS_MS.length;
            setAttempt((a) => a + 1);
        };
        window.addEventListener('online', onOnline);
        return () => window.removeEventListener('online', onOnline);
    }, [unavailable]);
    return React.createElement(React.Fragment, null, React.createElement('div', { ref }), unavailable ? props.fallback : null);
}
