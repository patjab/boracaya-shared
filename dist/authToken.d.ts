export declare const ID_TOKEN_KEY = "pdab_id_token";
/** Hold a freshly issued credential. Called by the GIS callback. */
export declare function setIdToken(token: string): void;
/** Drop the held credential. Called by signOut. */
export declare function clearIdToken(): void;
export declare function getIdToken(): string | null;
/**
 * Seconds until the held Google ID token expires, or undefined when no token
 * is held (cdk#1495): the auth-state field on a client error report. Reads
 * `exp` only — the token itself never leaves this module through here.
 */
export declare function idTokenExpiresInSeconds(): number | undefined;
export declare function authHeaders(): Record<string, string>;
/** Email claim from the current Google ID token, or null. */
export declare function getEmail(): string | null;
