"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getIdToken = exports.getEmail = exports.authHeaders = void 0;
exports.initAuth = initAuth;
exports.renderGoogleSignInButton = renderGoogleSignInButton;
exports.signOut = signOut;
// Sign-in for the pda-boracay frontends via Google Identity Services (GIS) (#161).
//
// The browser obtains a Google ID token directly from Google (no Cognito); the apps
// send it on gated API calls and the API authorizer verifies it (Google JWKS, aud =
// our client) against the RSVP guest list. One Google OAuth Web client serves test
// and prod (its Authorized JavaScript origins list every app origin). Google-only —
// no email OTP. Token is held in module scope (authToken.ts) and attached by useApi.
const authToken_1 = require("./authToken");
var authToken_2 = require("./authToken");
Object.defineProperty(exports, "authHeaders", { enumerable: true, get: function () { return authToken_2.authHeaders; } });
Object.defineProperty(exports, "getEmail", { enumerable: true, get: function () { return authToken_2.getEmail; } });
Object.defineProperty(exports, "getIdToken", { enumerable: true, get: function () { return authToken_2.getIdToken; } });
const CLIENT_ID = '129809912902-gudslqiduqd2opdk7n1rat829msgtias.apps.googleusercontent.com';
const GSI_SRC = 'https://accounts.google.com/gsi/client';
const gsi = () => { var _a, _b; return (typeof window !== 'undefined' ? (_b = (_a = window.google) === null || _a === void 0 ? void 0 : _a.accounts) === null || _b === void 0 ? void 0 : _b.id : undefined); };
// Load + initialize GIS once. `initAuth(app?)` keeps the old call sites working —
// GIS uses a single Google client for both apps, so the arg is ignored.
//
// On failure (script load error, or `initialize` throwing) the memo is reset so the
// next call retries instead of returning the cached rejected promise forever (#1278).
let gsiPromise = null;
function initAuth(_app) {
    if (typeof window === 'undefined')
        return Promise.resolve();
    if (gsiPromise)
        return gsiPromise;
    const attempt = new Promise((resolve, reject) => {
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
            // TRUE since valet#640 moved the token out of sessionStorage: nothing
            // carries a session across a page load any more, so without automatic
            // selection the organizer re-clicks "Continue with Google" on every
            // refresh, tab restore and deploy reload.
            //
            // NECESSARY BUT NOT SUFFICIENT, and the distinction cost a review round
            // (Codex r3 on shared#161). `auto_select` governs what happens when a One
            // Tap prompt RUNS; `initialize()` does not start one. Setting it here and
            // stopping would configure automatic selection for a prompt nothing ever
            // fires — the option would read as delivering silent re-auth while
            // changing nothing at all.
            //
            // Starting the prompt is the CONSUMER's call, deliberately: it puts
            // visible UI on the page, and this GIS client is shared across apps, so
            // one app opting in must not decide for the rest. boracaya-valet does it
            // on load when unauthenticated, with a fallback to the rendered button —
            // still needed, since One Tap can be suppressed by a post-dismissal
            // cooldown or by third-party-cookie restrictions. An app that never
            // prompts simply gets the button, exactly as before.
            auto_select: true,
            callback: (r) => {
                if (r.credential) {
                    (0, authToken_1.setIdToken)(r.credential);
                    window.dispatchEvent(new Event('pdab-auth-change'));
                }
            },
        });
    }).catch((err) => {
        if (gsiPromise === attempt)
            gsiPromise = null; // allow a later call to retry (#1278)
        throw err;
    });
    gsiPromise = attempt;
    return gsiPromise;
}
/** Internal UI adapter used by GoogleSignInButton after initAuth resolves. */
function renderGoogleSignInButton(element, text = 'continue_with') {
    const identity = gsi();
    if (!identity)
        throw new Error('Google Identity Services is not initialized');
    identity.renderButton(element, {
        type: 'standard',
        theme: 'filled_blue',
        size: 'large',
        text,
        shape: 'pill',
        logo_alignment: 'left',
    });
}
// ---- sign out ------------------------------------------------------------
function signOut() {
    var _a;
    (0, authToken_1.clearIdToken)();
    try {
        (_a = gsi()) === null || _a === void 0 ? void 0 : _a.disableAutoSelect();
    }
    catch (_b) {
        /* ignore */
    }
    window.dispatchEvent(new Event('pdab-auth-change'));
}
