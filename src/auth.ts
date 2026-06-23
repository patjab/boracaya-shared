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
import { CognitoUserPool, CognitoUser, AuthenticationDetails } from 'amazon-cognito-identity-js';

type App = 'checkin' | 'admin';

const isTestEnv =
  typeof window !== 'undefined' &&
  /(^|\.)test\.pdaboracay\.com$/.test(window.location.hostname);

// Cognito config per env. Domain prefix + region are deterministic; the app client
// ids are CDK-generated — fill them from the auth-stack outputs once deployed
// (CheckinClientId / AdminClientId, per env). #161.
const REGION = 'us-east-1';
const POOL_ID = isTestEnv ? 'TODO_TEST_POOL_ID' : 'TODO_PROD_POOL_ID';
const DOMAIN = `https://${isTestEnv ? 'pda-boracay-auth-testing' : 'pda-boracay-auth'}.auth.${REGION}.amazoncognito.com`;
const CLIENT_IDS: Record<App, string> = isTestEnv
  ? { checkin: 'TODO_TEST_CHECKIN_CLIENT_ID', admin: 'TODO_TEST_ADMIN_CLIENT_ID' }
  : { checkin: 'TODO_PROD_CHECKIN_CLIENT_ID', admin: 'TODO_PROD_ADMIN_CLIENT_ID' };

const TOKEN_KEY = 'pdab_id_token';
const VERIFIER_KEY = 'pdab_pkce_verifier';

let currentApp: App = 'checkin';
let clientId = CLIENT_IDS.checkin;
let pendingOtpUser: CognitoUser | null = null;

export function initAuth(app: App): void {
  currentApp = app;
  clientId = CLIENT_IDS[app];
}

const redirectUri = () => (typeof window !== 'undefined' ? window.location.origin + '/' : '');
const userPool = () => new CognitoUserPool({ UserPoolId: POOL_ID, ClientId: clientId });

// ---- token storage -------------------------------------------------------
export function getIdToken(): string | null {
  const t = sessionStorage.getItem(TOKEN_KEY);
  if (!t) return null;
  try {
    const { exp } = JSON.parse(atob(t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    if (exp * 1000 < Date.now()) {
      sessionStorage.removeItem(TOKEN_KEY);
      return null;
    }
    return t;
  } catch {
    return null;
  }
}
export const isAuthenticated = (): boolean => !!getIdToken();
export function authHeaders(): Record<string, string> {
  const t = getIdToken();
  return t ? { Authorization: `Bearer ${t}` } : {};
}
function setToken(t: string) {
  sessionStorage.setItem(TOKEN_KEY, t);
}

// ---- Google (hosted UI + PKCE) ------------------------------------------
function b64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
async function sha256(s: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));
}
function randomString(): string {
  const a = new Uint8Array(48);
  crypto.getRandomValues(a);
  return b64url(a);
}

export async function signInWithGoogle(): Promise<void> {
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
export async function completeSignIn(): Promise<boolean> {
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
        if (tok.id_token) setToken(tok.id_token);
      }
    } finally {
      sessionStorage.removeItem(VERIFIER_KEY);
      window.history.replaceState({}, '', redirectUri());
    }
  }
  return isAuthenticated();
}

// ---- Email OTP (Cognito CUSTOM_AUTH) ------------------------------------
// First send creates the user if needed (gated by the PreSignUp trigger to the
// RSVP guest list), then starts the custom-auth challenge which emails the code.
export function sendOtp(email: string): Promise<void> {
  const pool = userPool();
  return new Promise((resolve, reject) => {
    const start = () => {
      const user = new CognitoUser({ Username: email, Pool: pool });
      user.setAuthenticationFlowType('CUSTOM_AUTH');
      user.initiateAuth(new AuthenticationDetails({ Username: email }), {
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
      if (err && (err as { code?: string }).code !== 'UsernameExistsException') return reject(err);
      start();
    });
  });
}

export function confirmOtp(code: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!pendingOtpUser) return reject(new Error('No code was requested'));
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
export function signOut(): void {
  sessionStorage.removeItem(TOKEN_KEY);
  window.location.assign(
    `${DOMAIN}/logout?client_id=${encodeURIComponent(clientId)}&logout_uri=${encodeURIComponent(redirectUri())}`,
  );
}
