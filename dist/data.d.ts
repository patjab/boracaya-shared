/**
 * Typed failure from the call primitives. `status` is set for HTTP-level
 * failures (non-2xx); network/parse failures leave it undefined. `label` is the
 * caller's short name for the read/write ("invites", "save template") so logs
 * and error states say which call failed without URL spelunking.
 */
export declare class ApiError extends Error {
    readonly label: string;
    readonly status?: number;
    constructor(label: string, message: string, status?: number);
}
interface CallOptions {
    /** Short human name for the call, used in errors/logs. Defaults to the URL. */
    label?: string;
    /** Extra headers; merged over the auto-attached auth headers. */
    headers?: Record<string, string>;
    /**
     * Cancels the underlying fetch when aborted (cache.ts threads this through
     * so a key switch stops the old key's request on the wire, admin#159).
     */
    signal?: AbortSignal;
}
/**
 * Read primitive: GET the URL, guard `res.ok`, parse JSON. The signed-in Google
 * token (when present) is attached automatically — same behavior consumers get
 * from the admin's patched fetch, made explicit. Throws ApiError on any failure.
 * A successful empty response (204, or 200 with a blank body) resolves to
 * undefined — reflected in the return type — rather than failing JSON parse.
 */
export declare function getJson<T>(url: string, opts?: CallOptions): Promise<T | undefined>;
/**
 * Resilient read: like getJson but NEVER throws — a failure logs and returns
 * the fallback, so one failing endpoint degrades only its own slice of a
 * multi-read screen instead of blanking it. (The `jsonOr` both RSVP screens
 * independently reinvented, homed.)
 */
export declare function jsonOr<T>(url: string, label: string, fallback: T, opts?: CallOptions): Promise<T>;
interface SendOptions extends CallOptions {
    method: 'POST' | 'PUT' | 'PATCH' | 'DELETE';
    /** JSON-serialized as the request body when provided. */
    body?: unknown;
}
/**
 * Write primitive: JSON body, ok-guard, and error mapping that prefers the
 * server's own message — a non-2xx with `{ "error": "..." }` surfaces that text
 * (e.g. a 409 "template already exists") instead of a bare status code.
 * Returns the parsed response body, or undefined when the response has none
 * (reflected in the return type).
 */
export declare function sendJson<T = void>(url: string, opts: SendOptions): Promise<T | undefined>;
/**
 * Defensive text coercion, homed here so every surface handles response-shape
 * quirks the same way. Coerce before trimming: joined API rows occasionally
 * carry a non-string in a field treated as text (e.g. a boolean `attending`),
 * and a bare `.trim()` on it throws — the failure class behind admin#69's
 * forever-spinner.
 */
export declare const clean: (v?: unknown) => string;
/**
 * Envelope coercion: accepts a bare array or an `{ items: [...] }` wrapper and
 * always returns a real array — anything else (error object, null, off-shape
 * envelope) becomes [] so a single bad read degrades its slice instead of
 * throwing out of the screen's view-model join.
 */
export declare const asArray: <T>(v: unknown) => T[];
export interface GuardedState<T> {
    data: T | null;
    isLoading: boolean;
    error: string | null;
}
/**
 * The loading/error contract, as a plain function so the guarantee is testable
 * without React: run the loader (fetches AND the view-model transform — so a
 * bad field surfaces as an error state, not a hang), report the result through
 * `set`, and ALWAYS clear isLoading via finally. hooks/useGuardedLoad binds
 * this to component state.
 */
export declare function runGuarded<T>(load: () => Promise<T>, set: (next: GuardedState<T>) => void, errorMessage: string): Promise<void>;
export {};
