"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ID_TOKEN_KEY = void 0;
exports.setIdToken = setIdToken;
exports.clearIdToken = clearIdToken;
exports.getIdToken = getIdToken;
exports.authHeaders = authHeaders;
exports.getEmail = getEmail;
// Token-only browser identity primitives. Keeping these separate from the GIS
// loader lets CommonJS data/bootstrap consumers attach an existing token
// without retaining script-loading and sign-in-button implementation details.
//
// The token lives in a MODULE-SCOPE variable, not sessionStorage (valet#640).
// It is the organizer's real Google ID token — not a scoped session — and in
// sessionStorage it was readable at any moment by any script on the origin,
// which is a large graph: Tiptap and its extensions, CodeMirror, parse5, plus a
// runtime-injected GIS script. One compromised release replays it server-to-
// server with the authority of every event that organizer administers.
//
// Honest about the size of the win: an attacker already running script here can
// still hook fetch and read the Authorization header. What this removes is the
// token AT REST across page loads, and the trivial
// `sessionStorage.getItem('pdab_id_token')` grab a generic payload tries first.
exports.ID_TOKEN_KEY = 'pdab_id_token';
let idToken = null;
/**
 * One-shot bootstrap: adopt a token seeded into sessionStorage before page JS
 * ran, then delete it so it is not left at rest.
 *
 * This is the e2e seam. `boracaya-e2e`'s `loginAdmin` seeds the key through
 * Playwright `addInitScript` because driving a real Google sign-in per test is
 * not viable. Nothing in production writes this key — the GIS callback calls
 * `setIdToken` directly — so on a real page load there is nothing here to read.
 */
const adoptSeededToken = () => {
    if (typeof sessionStorage === 'undefined')
        return;
    try {
        const seeded = sessionStorage.getItem(exports.ID_TOKEN_KEY);
        if (seeded) {
            idToken = seeded;
            sessionStorage.removeItem(exports.ID_TOKEN_KEY);
        }
    }
    catch (_a) {
        // Storage can throw outright (Safari private mode, blocked site data).
        // A missing seed is simply an unauthenticated page, which is a valid state.
    }
};
adoptSeededToken();
/** Hold a freshly issued credential. Called by the GIS callback. */
function setIdToken(token) {
    idToken = token;
}
/** Drop the held credential. Called by signOut. */
function clearIdToken() {
    idToken = null;
}
function getIdToken() {
    const token = idToken;
    if (!token)
        return null;
    try {
        const payload = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
        const { exp } = JSON.parse(atob(payload));
        if (exp * 1000 < Date.now()) {
            idToken = null;
            return null;
        }
        return token;
    }
    catch (_a) {
        return null;
    }
}
function authHeaders() {
    const token = getIdToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
}
/** Email claim from the current Google ID token, or null. */
function getEmail() {
    const token = getIdToken();
    if (!token)
        return null;
    try {
        const payload = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
        const parsed = JSON.parse(atob(payload));
        return typeof parsed.email === 'string' ? parsed.email : null;
    }
    catch (_a) {
        return null;
    }
}
