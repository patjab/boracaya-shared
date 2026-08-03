export declare const ID_TOKEN_KEY = "pdab_id_token";
export declare function getIdToken(): string | null;
export declare function authHeaders(): Record<string, string>;
/** Email claim from the current Google ID token, or null. */
export declare function getEmail(): string | null;
