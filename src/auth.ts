// Sign-in for the pda-boracay frontends via Google Identity Services (GIS) (#161).
//
// The browser obtains a Google ID token directly from Google (no Cognito); the apps
// send it on gated API calls and the API authorizer verifies it (Google JWKS, aud =
// our client) against the RSVP guest list. One Google OAuth Web client serves test
// and prod (its Authorized JavaScript origins list every app origin). Google-only —
// no email OTP. Token lives in sessionStorage and is attached by useApi.
import * as React from 'react';

const CLIENT_ID = '129809912902-gudslqiduqd2opdk7n1rat829msgtias.apps.googleusercontent.com';
const TOKEN_KEY = 'pdab_id_token';
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
let gsiPromise: Promise<void> | null = null;
export function initAuth(_app?: App): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  if (gsiPromise) return gsiPromise;
  gsiPromise = new Promise<void>((resolve, reject) => {
    if (gsi()) return resolve();
    const s = document.createElement('script');
    s.src = GSI_SRC;
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Failed to load Google Identity Services'));
    document.head.appendChild(s);
  }).then(() => {
    gsi()!.initialize({
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

/** Email claim from the current Google ID token (for display / scoping), or null. */
export function getEmail(): string | null {
  const t = getIdToken();
  if (!t) return null;
  try {
    return JSON.parse(atob(t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).email ?? null;
  } catch {
    return null;
  }
}

// ---- React sign-in button ------------------------------------------------
// Renders the official Google button; on success the token is stored and
// `onSignIn` fires (and a window 'pdab-auth-change' event is dispatched).
export function GoogleSignInButton(props: { onSignIn?: () => void; text?: string }): React.ReactElement {
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    let cancelled = false;
    initAuth().then(() => {
      if (cancelled || !ref.current) return;
      gsi()!.renderButton(ref.current, {
        type: 'standard',
        theme: 'filled_blue',
        size: 'large',
        text: props.text ?? 'continue_with',
        shape: 'pill',
        logo_alignment: 'left',
      });
    });
    const onChange = () => props.onSignIn?.();
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
export function signOut(): void {
  sessionStorage.removeItem(TOKEN_KEY);
  try {
    gsi()?.disableAutoSelect();
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new Event('pdab-auth-change'));
}
