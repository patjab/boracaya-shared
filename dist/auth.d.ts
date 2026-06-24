import * as React from 'react';
type App = 'checkin' | 'admin';
export declare function initAuth(_app?: App): Promise<void>;
export declare function getIdToken(): string | null;
export declare const isAuthenticated: () => boolean;
export declare function authHeaders(): Record<string, string>;
/** Email claim from the current Google ID token (for display / scoping), or null. */
export declare function getEmail(): string | null;
export declare function GoogleSignInButton(props: {
    onSignIn?: () => void;
    text?: string;
}): React.ReactElement;
export declare function signOut(): void;
export {};
