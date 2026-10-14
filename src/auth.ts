// Sign-in for the pda-boracay frontends via Google Identity Services (GIS) (#161).
//
// The browser obtains a Google ID token directly from Google (no Cognito); the apps
// send it on gated API calls and the API authorizer verifies it (Google JWKS, aud =
// our client) against the RSVP guest list. Google-only — no email OTP. Token is held
// in module scope (authToken.ts) and attached by useApi.
//
// One Google OAuth Web client PER ENVIRONMENT (cdk#1883): a shared client let an ID
// token minted on any testing origin pass prod's `aud` check. The client is picked
// at runtime from the page hostname (env.ts), the same way api.ts picks the API, and
// must equal that environment's ENV_CONFIG[env].auth.googleClientId in the CDK.
import { setIdToken, clearIdToken } from './authToken';
import { getEnv, type EnvName } from './env';

export { authHeaders, getEmail, getIdToken } from './authToken';

const CLIENT_ID_BY_ENV: Record<EnvName, string> = {
  PROD: '129809912902-gudslqiduqd2opdk7n1rat829msgtias.apps.googleusercontent.com',
  TEST: '129809912902-chmba2sh0uhjh8pasm2t2bc8houb2u32.apps.googleusercontent.com',
};

/** The GIS client id for the page's environment (cdk#1883). */
const googleClientId = (): string => CLIENT_ID_BY_ENV[getEnv()];
const GSI_SRC = 'https://accounts.google.com/gsi/client';

type App = 'checkin' | 'admin';

interface GsiId {
  initialize(cfg: { client_id: string; callback: (r: { credential?: string }) => void; auto_select?: boolean }): void;
  renderButton(el: HTMLElement, opts: Record<string, unknown>): void;
  disableAutoSelect(): void;
}
const gsi = (): GsiId | undefined =>
  (typeof window !== 'undefined' ? (window as unknown as { google?: { accounts?: { id?: GsiId } } }).google?.accounts?.id : undefined);

// Load + initialize GIS once. `initAuth(app?)` keeps the old call sites working —
// GIS uses a single Google client for both apps, so the arg is ignored.
//
// On failure (script load error, or `initialize` throwing) the memo is reset so the
// next call retries instead of returning the cached rejected promise forever (#1278).
let gsiPromise: Promise<void> | null = null;
export function initAuth(_app?: App): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  if (gsiPromise) return gsiPromise;
  const attempt = new Promise<void>((resolve, reject) => {
    if (gsi()) return resolve();
    const s = document.createElement('script');
    s.src = GSI_SRC;
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => {
      // A failed element is dead weight: drop it so a retry's script is the only
      // gsi <script> in <head> (shore#577).
      s.parentNode?.removeChild(s);
      reject(new Error('Failed to load Google Identity Services'));
    };
    document.head.appendChild(s);
  }).then(() => {
    gsi()!.initialize({
      client_id: googleClientId(),
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
          setIdToken(r.credential);
          window.dispatchEvent(new Event('pdab-auth-change'));
        }
      },
    });
  }).catch((err: unknown) => {
    if (gsiPromise === attempt) gsiPromise = null; // allow a later call to retry (#1278)
    throw err;
  });
  gsiPromise = attempt;
  return gsiPromise;
}

/** Internal UI adapter used by GoogleSignInButton after initAuth resolves. */
export function renderGoogleSignInButton(element: HTMLElement, text = 'continue_with'): void {
  const identity = gsi();
  if (!identity) throw new Error('Google Identity Services is not initialized');
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
export function signOut(): void {
  clearIdToken();
  try {
    gsi()?.disableAutoSelect();
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new Event('pdab-auth-change'));
}
