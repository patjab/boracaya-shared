import * as React from 'react';
/**
 * Renders the official Google button. Kept outside the identity primitives so
 * API/client imports do not retain React UI code.
 *
 * When Google Identity Services cannot load (content blocker, filtered network,
 * offline), the button retries with increasing delays, then gives up: it calls
 * `onUnavailable` and renders `fallback` beside its empty slot. Each later
 * `online` event makes one more attempt; success removes the fallback.
 */
export declare function GoogleSignInButton(props: {
    onSignIn?: () => void;
    text?: string;
    /** Shown once the retries are exhausted, until a later attempt succeeds. */
    fallback?: React.ReactNode;
    /** Called each time the retries are exhausted (and after a failed `online` retry). */
    onUnavailable?: () => void;
}): React.ReactElement;
