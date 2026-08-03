export { authHeaders, getEmail, getIdToken } from './authToken';
type App = 'checkin' | 'admin';
export declare function initAuth(_app?: App): Promise<void>;
/** Internal UI adapter used by GoogleSignInButton after initAuth resolves. */
export declare function renderGoogleSignInButton(element: HTMLElement, text?: string): void;
export declare function signOut(): void;
