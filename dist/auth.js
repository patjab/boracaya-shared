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
exports.isAuthenticated = void 0;
exports.initAuth = initAuth;
exports.getIdToken = getIdToken;
exports.authHeaders = authHeaders;
exports.getEmail = getEmail;
exports.GoogleSignInButton = GoogleSignInButton;
exports.signOut = signOut;
// Sign-in for the pda-boracay frontends via Google Identity Services (GIS) (#161).
//
// The browser obtains a Google ID token directly from Google (no Cognito); the apps
// send it on gated API calls and the API authorizer verifies it (Google JWKS, aud =
// our client) against the RSVP guest list. One Google OAuth Web client serves test
// and prod (its Authorized JavaScript origins list every app origin). Google-only —
// no email OTP. Token lives in sessionStorage and is attached by useApi.
const React = __importStar(require("react"));
const CLIENT_ID = '129809912902-gudslqiduqd2opdk7n1rat829msgtias.apps.googleusercontent.com';
const TOKEN_KEY = 'pdab_id_token';
const GSI_SRC = 'https://accounts.google.com/gsi/client';
const gsi = () => { var _a, _b; return (typeof window !== 'undefined' ? (_b = (_a = window.google) === null || _a === void 0 ? void 0 : _a.accounts) === null || _b === void 0 ? void 0 : _b.id : undefined); };
// Load + initialize GIS once. `initAuth(app?)` keeps the old call sites working —
// GIS uses a single Google client for both apps, so the arg is ignored.
let gsiPromise = null;
function initAuth(_app) {
    if (typeof window === 'undefined')
        return Promise.resolve();
    if (gsiPromise)
        return gsiPromise;
    gsiPromise = new Promise((resolve, reject) => {
        if (gsi())
            return resolve();
        const s = document.createElement('script');
        s.src = GSI_SRC;
        s.async = true;
        s.defer = true;
        s.onload = () => resolve();
        s.onerror = () => reject(new Error('Failed to load Google Identity Services'));
        document.head.appendChild(s);
    }).then(() => {
        gsi().initialize({
            client_id: CLIENT_ID,
            auto_select: false,
            callback: (r) => {
                if (r.credential) {
                    sessionStorage.setItem(TOKEN_KEY, r.credential);
                    window.dispatchEvent(new Event('pdab-auth-change'));
                }
            },
        });
    });
    return gsiPromise;
}
// ---- token storage -------------------------------------------------------
function getIdToken() {
    const t = sessionStorage.getItem(TOKEN_KEY);
    if (!t)
        return null;
    try {
        const { exp } = JSON.parse(atob(t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
        if (exp * 1000 < Date.now()) {
            sessionStorage.removeItem(TOKEN_KEY);
            return null;
        }
        return t;
    }
    catch (_a) {
        return null;
    }
}
const isAuthenticated = () => !!getIdToken();
exports.isAuthenticated = isAuthenticated;
function authHeaders() {
    const t = getIdToken();
    return t ? { Authorization: `Bearer ${t}` } : {};
}
/** Email claim from the current Google ID token (for display / scoping), or null. */
function getEmail() {
    var _a;
    const t = getIdToken();
    if (!t)
        return null;
    try {
        return (_a = JSON.parse(atob(t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).email) !== null && _a !== void 0 ? _a : null;
    }
    catch (_b) {
        return null;
    }
}
// ---- React sign-in button ------------------------------------------------
// Renders the official Google button; on success the token is stored and
// `onSignIn` fires (and a window 'pdab-auth-change' event is dispatched).
function GoogleSignInButton(props) {
    const ref = React.useRef(null);
    React.useEffect(() => {
        let cancelled = false;
        initAuth().then(() => {
            var _a;
            if (cancelled || !ref.current)
                return;
            gsi().renderButton(ref.current, {
                type: 'standard',
                theme: 'filled_blue',
                size: 'large',
                text: (_a = props.text) !== null && _a !== void 0 ? _a : 'continue_with',
                shape: 'pill',
                logo_alignment: 'left',
            });
        });
        const onChange = () => { var _a; return (_a = props.onSignIn) === null || _a === void 0 ? void 0 : _a.call(props); };
        window.addEventListener('pdab-auth-change', onChange);
        return () => {
            cancelled = true;
            window.removeEventListener('pdab-auth-change', onChange);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    return React.createElement('div', { ref });
}
// ---- sign out ------------------------------------------------------------
function signOut() {
    var _a;
    sessionStorage.removeItem(TOKEN_KEY);
    try {
        (_a = gsi()) === null || _a === void 0 ? void 0 : _a.disableAutoSelect();
    }
    catch (_b) {
        /* ignore */
    }
    window.dispatchEvent(new Event('pdab-auth-change'));
}
