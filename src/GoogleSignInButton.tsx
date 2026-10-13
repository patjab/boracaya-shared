import * as React from 'react';
import { initAuth, renderGoogleSignInButton } from './auth';

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
export function GoogleSignInButton(props: {
  onSignIn?: () => void;
  text?: string;
  /** Shown once the retries are exhausted, until a later attempt succeeds. */
  fallback?: React.ReactNode;
  /** Called each time the retries are exhausted (and after a failed `online` retry). */
  onUnavailable?: () => void;
}): React.ReactElement {
  const ref = React.useRef<HTMLDivElement>(null);
  const [attempt, setAttempt] = React.useState(0);
  const [unavailable, setUnavailable] = React.useState(false);
  // Indexes RETRY_DELAYS_MS; a failure past its end gives up.
  const failures = React.useRef(0);
  const onUnavailable = React.useRef(props.onUnavailable);
  onUnavailable.current = props.onUnavailable;
  React.useEffect(() => {
    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    initAuth()
      .then(() => {
        if (cancelled) return;
        failures.current = 0;
        setUnavailable(false);
        if (!ref.current) return;
        renderGoogleSignInButton(ref.current, props.text);
      })
      .catch(() => {
        // GIS failed to load/initialize (initAuth reset its memo, #1278): retry this
        // mount with backoff so a transient blip self-heals without a reload, but
        // stop after RETRY_DELAYS_MS so a blocked script is not re-fetched forever.
        if (cancelled) return;
        const delay = RETRY_DELAYS_MS[failures.current];
        failures.current += 1;
        if (delay !== undefined) {
          retryTimer = setTimeout(() => setAttempt((a) => a + 1), delay);
          return;
        }
        setUnavailable(true);
        onUnavailable.current?.();
      });
    const onChange = () => props.onSignIn?.();
    window.addEventListener('pdab-auth-change', onChange);
    return () => {
      cancelled = true;
      if (retryTimer !== undefined) clearTimeout(retryTimer);
      window.removeEventListener('pdab-auth-change', onChange);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt]);
  React.useEffect(() => {
    if (!unavailable) return undefined;
    // One fresh attempt per reconnect; a failure there gives up again at once.
    const onOnline = () => {
      failures.current = RETRY_DELAYS_MS.length;
      setAttempt((a) => a + 1);
    };
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, [unavailable]);
  return React.createElement(
    React.Fragment,
    null,
    React.createElement('div', { ref }),
    unavailable ? props.fallback : null,
  );
}
