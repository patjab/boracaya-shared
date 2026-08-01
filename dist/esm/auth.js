// Sign-in for the pda-boracay frontends via Google Identity Services (GIS) (#161).
//
// The browser obtains a Google ID token directly from Google (no Cognito); the apps
// send it on gated API calls and the API authorizer verifies it (Google JWKS, aud =
// our client) against the RSVP guest list. One Google OAuth Web client serves test
// and prod (its Authorized JavaScript origins list every app origin). Google-only —
// no email OTP. Token lives in sessionStorage and is attached by useApi.
import { ID_TOKEN_KEY } from './authToken.js';
export { authHeaders, getEmail, getIdToken } from './authToken.js';
const CLIENT_ID = '129809912902-gudslqiduqd2opdk7n1rat829msgtias.apps.googleusercontent.com';
const GSI_SRC = 'https://accounts.google.com/gsi/client';
const gsi = () => { var _a, _b; return (typeof window !== 'undefined' ? (_b = (_a = window.google) === null || _a === void 0 ? void 0 : _a.accounts) === null || _b === void 0 ? void 0 : _b.id : undefined); };
// Load + initialize GIS once. `initAuth(app?)` keeps the old call sites working —
// GIS uses a single Google client for both apps, so the arg is ignored.
//
// On failure (script load error, or `initialize` throwing) the memo is reset so the
// next call retries instead of returning the cached rejected promise forever (#1278).
let gsiPromise = null;
export function initAuth(_app) {
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
            auto_select: false,
            callback: (r) => {
                if (r.credential) {
                    sessionStorage.setItem(ID_TOKEN_KEY, r.credential);
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
export function renderGoogleSignInButton(element, text = 'continue_with') {
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
export function signOut() {
    var _a;
    sessionStorage.removeItem(ID_TOKEN_KEY);
    try {
        (_a = gsi()) === null || _a === void 0 ? void 0 : _a.disableAutoSelect();
    }
    catch (_b) {
        /* ignore */
    }
    window.dispatchEvent(new Event('pdab-auth-change'));
}
