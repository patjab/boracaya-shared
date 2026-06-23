type App = 'checkin' | 'admin';
export declare function initAuth(app: App): void;
export declare function getIdToken(): string | null;
export declare const isAuthenticated: () => boolean;
export declare function authHeaders(): Record<string, string>;
export declare function signInWithGoogle(): Promise<void>;
/** Call once on load. If we returned from the hosted UI with ?code=, exchange it. */
export declare function completeSignIn(): Promise<boolean>;
export declare function sendOtp(email: string): Promise<void>;
export declare function confirmOtp(code: string): Promise<void>;
export declare function signOut(): void;
export {};
