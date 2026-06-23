"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isAuthenticated = void 0;
exports.initAuth = initAuth;
exports.getIdToken = getIdToken;
exports.authHeaders = authHeaders;
exports.signInWithGoogle = signInWithGoogle;
exports.completeSignIn = completeSignIn;
exports.sendOtp = sendOtp;
exports.confirmOtp = confirmOtp;
exports.signOut = signOut;
// Unified sign-in for the pda-boracay frontends (#161).
//
// Two ways in, both yielding a Cognito ID token that the apps send on gated API
// calls (the API authorizers verify it + the RSVP-table membership):
//   - Google: hosted-UI redirect with PKCE (no SDK, no client secret).
//   - Email OTP: Cognito CUSTOM_AUTH via amazon-cognito-identity-js.
//
// The target environment is picked at runtime from the hostname (same rule as
// api.ts): *.test.pdaboracay.com -> the testing pool; everything else -> prod.
// Each app calls `initAuth('checkin' | 'admin')` once at startup to select its
// app client; tokens live in sessionStorage and are attached by useApi.
const amazon_cognito_identity_js_1 = require("amazon-cognito-identity-js");
const isTestEnv = typeof window !== 'undefined' &&
    /(^|\.)test\.pdaboracay\.com$/.test(window.location.hostname);
// Cognito config per env. Domain prefix + region are deterministic; the app client
// ids are CDK-generated — fill them from the auth-stack outputs once deployed
// (CheckinClientId / AdminClientId, per env). #161.
const REGION = 'us-east-1';
const POOL_ID = isTestEnv ? 'TODO_TEST_POOL_ID' : 'TODO_PROD_POOL_ID';
const DOMAIN = `https://${isTestEnv ? 'pda-boracay-auth-testing' : 'pda-boracay-auth'}.auth.${REGION}.amazoncognito.com`;
const CLIENT_IDS = isTestEnv
    ? { checkin: 'TODO_TEST_CHECKIN_CLIENT_ID', admin: 'TODO_TEST_ADMIN_CLIENT_ID' }
    : { checkin: 'TODO_PROD_CHECKIN_CLIENT_ID', admin: 'TODO_PROD_ADMIN_CLIENT_ID' };
const TOKEN_KEY = 'pdab_id_token';
const VERIFIER_KEY = 'pdab_pkce_verifier';
let currentApp = 'checkin';
let clientId = CLIENT_IDS.checkin;
let pendingOtpUser = null;
function initAuth(app) {
    currentApp = app;
    clientId = CLIENT_IDS[app];
}
const redirectUri = () => (typeof window !== 'undefined' ? window.location.origin + '/' : '');
const userPool = () => new amazon_cognito_identity_js_1.CognitoUserPool({ UserPoolId: POOL_ID, ClientId: clientId });
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
function setToken(t) {
    sessionStorage.setItem(TOKEN_KEY, t);
}
// ---- Google (hosted UI + PKCE) ------------------------------------------
function b64url(bytes) {
    return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
async function sha256(s) {
    return new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));
}
function randomString() {
    const a = new Uint8Array(48);
    crypto.getRandomValues(a);
    return b64url(a);
}
async function signInWithGoogle() {
    const verifier = randomString();
    sessionStorage.setItem(VERIFIER_KEY, verifier);
    const challenge = b64url(await sha256(verifier));
    const params = new URLSearchParams({
        client_id: clientId,
        response_type: 'code',
        scope: 'openid email profile',
        redirect_uri: redirectUri(),
        identity_provider: 'Google',
        code_challenge: challenge,
        code_challenge_method: 'S256',
    });
    window.location.assign(`${DOMAIN}/oauth2/authorize?${params.toString()}`);
}
/** Call once on load. If we returned from the hosted UI with ?code=, exchange it. */
async function completeSignIn() {
    const code = new URLSearchParams(window.location.search).get('code');
    if (code) {
        try {
            const body = new URLSearchParams({
                grant_type: 'authorization_code',
                client_id: clientId,
                code,
                redirect_uri: redirectUri(),
                code_verifier: sessionStorage.getItem(VERIFIER_KEY) || '',
            });
            const res = await fetch(`${DOMAIN}/oauth2/token`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: body.toString(),
            });
            if (res.ok) {
                const tok = await res.json();
                if (tok.id_token)
                    setToken(tok.id_token);
            }
        }
        finally {
            sessionStorage.removeItem(VERIFIER_KEY);
            window.history.replaceState({}, '', redirectUri());
        }
    }
    return (0, exports.isAuthenticated)();
}
// ---- Email OTP (Cognito CUSTOM_AUTH) ------------------------------------
// First send creates the user if needed (gated by the PreSignUp trigger to the
// RSVP guest list), then starts the custom-auth challenge which emails the code.
function sendOtp(email) {
    const pool = userPool();
    return new Promise((resolve, reject) => {
        const start = () => {
            const user = new amazon_cognito_identity_js_1.CognitoUser({ Username: email, Pool: pool });
            user.setAuthenticationFlowType('CUSTOM_AUTH');
            user.initiateAuth(new amazon_cognito_identity_js_1.AuthenticationDetails({ Username: email }), {
                onSuccess: () => resolve(), // shouldn't happen before a challenge
                onFailure: (err) => reject(err),
                customChallenge: () => {
                    pendingOtpUser = user;
                    resolve();
                },
            });
        };
        // Ensure the user exists (PreSignUp enforces the allowlist). Ignore "exists".
        const randomPw = randomString() + 'Aa1!';
        pool.signUp(email, randomPw, [], [], (err) => {
            if (err && err.code !== 'UsernameExistsException')
                return reject(err);
            start();
        });
    });
}
function confirmOtp(code) {
    return new Promise((resolve, reject) => {
        if (!pendingOtpUser)
            return reject(new Error('No code was requested'));
        pendingOtpUser.sendCustomChallengeAnswer(code, {
            onSuccess: (session) => {
                setToken(session.getIdToken().getJwtToken());
                pendingOtpUser = null;
                resolve();
            },
            onFailure: (err) => reject(err),
            customChallenge: () => reject(new Error('Incorrect or expired code')),
        });
    });
}
// ---- sign out ------------------------------------------------------------
function signOut() {
    sessionStorage.removeItem(TOKEN_KEY);
    window.location.assign(`${DOMAIN}/logout?client_id=${encodeURIComponent(clientId)}&logout_uri=${encodeURIComponent(redirectUri())}`);
}
