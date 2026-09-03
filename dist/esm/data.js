// The shared data-access layer (#28): one seam for fetch + auth-header attach +
// ok-guard + JSON parse + error mapping, the resilient multi-read pattern, and
// the defensive response-shape coercions — so screens stop hand-rolling (and
// drifting on) each of these. React binding lives in hooks/useGuardedLoad.ts;
// this module is plain TypeScript so Node consumers (e2e, contract tests) can
// import it safely.
import { authHeaders } from './authToken.js';
import { apiCaught, apiFailed, apiSucceeded } from './apiObserver.js';
import { retryAfterSeconds as parseRetryAfterSeconds } from './security.js';
// authHeaders() reads sessionStorage, which doesn't exist in Node (e2e, the
// contract test) — and this module must stay Node-safe like guestAuth.ts. No
// storage simply means no token to attach.
const safeAuthHeaders = () => {
    try {
        return authHeaders();
    }
    catch (_a) {
        return {};
    }
};
/**
 * Typed failure from the call primitives. `status` is set for HTTP-level
 * failures (non-2xx); network/parse failures leave it undefined. `label` is the
 * caller's short name for the read/write ("invites", "save template") so logs
 * and error states say which call failed without URL spelunking.
 */
export class ApiError extends Error {
    constructor(label, message, status, retryAfter) {
        super(message);
        this.name = 'ApiError';
        this.label = label;
        this.status = status;
        this.retryAfterSeconds = retryAfter;
    }
}
// A body-stream read failure (connection reset mid-body, etc.) is a failed
// call, not a successful empty response — surface it instead of masking it.
const readBody = async (res, label) => {
    try {
        return await res.text();
    }
    catch (e) {
        throw new ApiError(label, `${label}: failed to read the response body (${e instanceof Error ? e.message : String(e)})`, res.status);
    }
};
// cdk#1495: every failure the call primitives raise is observed ONCE, here,
// with the join key to the backend (`x-amzn-RequestId`, exposed through CORS
// by cdk#1496) and the call's duration; a success leaves only a breadcrumb.
// Through the apiObserver seam, not the reporter itself, so this module stays
// out of the reporter's graph (the bootstrap size gate).
const requestIdOf = (res) => {
    const id = res.headers && typeof res.headers.get === 'function'
        ? res.headers.get('x-amzn-RequestId')
        : null;
    return id !== null && id !== void 0 ? id : undefined;
};
const failed = (err, method, url, startedAt, res) => {
    apiFailed({
        label: err.label, message: err.message, status: err.status, method, url,
        requestId: res ? requestIdOf(res) : undefined, durationMs: Date.now() - startedAt,
    });
    return err;
};
/**
 * Read primitive: GET the URL, guard `res.ok`, parse JSON. The signed-in Google
 * token (when present) is attached automatically — same behavior consumers get
 * from the admin's patched fetch, made explicit. Throws ApiError on any failure.
 * A successful empty response (204, or 200 with a blank body) resolves to
 * undefined — reflected in the return type — rather than failing JSON parse.
 */
export async function getJson(url, opts = {}) {
    var _a, _b;
    const label = (_a = opts.label) !== null && _a !== void 0 ? _a : url;
    const startedAt = Date.now();
    let res;
    try {
        res = await fetch(url, { headers: { ...safeAuthHeaders(), ...opts.headers }, signal: opts.signal });
    }
    catch (e) {
        // An intentional abort (a key switch, dispose) is not a failure worth a report.
        const err = new ApiError(label, `${label}: network error (${e instanceof Error ? e.message : String(e)})`);
        throw ((_b = opts.signal) === null || _b === void 0 ? void 0 : _b.aborted) ? err : failed(err, 'GET', url, startedAt);
    }
    if (!res.ok)
        throw failed(new ApiError(label, `${label}: HTTP ${res.status}`, res.status), 'GET', url, startedAt, res);
    let text;
    try {
        text = await readBody(res, label);
    }
    catch (e) {
        throw failed(e, 'GET', url, startedAt, res);
    }
    if (!text.trim()) {
        apiSucceeded('GET', url, res.status);
        return undefined;
    }
    let parsed;
    try {
        parsed = JSON.parse(text);
    }
    catch (_c) {
        throw failed(new ApiError(label, `${label}: response was not valid JSON`, res.status), 'GET', url, startedAt, res);
    }
    apiSucceeded('GET', url, res.status);
    return parsed;
}
/**
 * Resilient read: like getJson but NEVER throws — a failure logs and returns
 * the fallback, so one failing endpoint degrades only its own slice of a
 * multi-read screen instead of blanking it. (The `jsonOr` both RSVP screens
 * independently reinvented, homed.)
 */
export async function jsonOr(url, label, fallback, opts = {}) {
    var _a;
    try {
        return (_a = (await getJson(url, { ...opts, label }))) !== null && _a !== void 0 ? _a : fallback;
    }
    catch (e) {
        console.error(`data: ${label} failed to load:`, e);
        // An ApiError already reported itself at the throw site; anything else
        // (a parse of the parsed body throwing) is a swallowed failure worth one.
        if (!(e instanceof ApiError))
            apiCaught(label, e);
        return fallback;
    }
}
/**
 * Write primitive: JSON body, ok-guard, and error mapping that prefers the
 * server's own message — a non-2xx with `{ "error": "..." }` surfaces that text
 * (e.g. a 409 "template already exists") instead of a bare status code.
 * Returns the parsed response body, or undefined when the response has none
 * (reflected in the return type).
 */
export async function sendJson(url, opts) {
    var _a, _b, _c, _d;
    const label = (_a = opts.label) !== null && _a !== void 0 ? _a : url;
    const startedAt = Date.now();
    let res;
    try {
        res = await fetch(url, {
            method: opts.method,
            signal: opts.signal,
            headers: {
                ...(opts.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
                ...safeAuthHeaders(),
                ...opts.headers,
            },
            ...(opts.body !== undefined ? { body: JSON.stringify(opts.body) } : {}),
        });
    }
    catch (e) {
        const err = new ApiError(label, `${label}: network error (${e instanceof Error ? e.message : String(e)})`);
        throw ((_b = opts.signal) === null || _b === void 0 ? void 0 : _b.aborted) ? err : failed(err, opts.method, url, startedAt);
    }
    let text;
    try {
        text = await readBody(res, label);
    }
    catch (e) {
        throw failed(e, opts.method, url, startedAt, res);
    }
    if (!res.ok) {
        let serverMessage;
        let bodyRetryAfter;
        try {
            const parsed = JSON.parse(text);
            const m = (_c = parsed === null || parsed === void 0 ? void 0 : parsed.error) !== null && _c !== void 0 ? _c : parsed === null || parsed === void 0 ? void 0 : parsed.message;
            if (typeof m === 'string' && m.trim())
                serverMessage = m;
            if (typeof parsed.retryAfterSeconds === 'number'
                && Number.isSafeInteger(parsed.retryAfterSeconds)
                && parsed.retryAfterSeconds >= 0) {
                bodyRetryAfter = parsed.retryAfterSeconds;
            }
        }
        catch (_e) {
            /* non-JSON error body -> fall through to the status message */
        }
        const retryHeader = res.headers && typeof res.headers.get === 'function'
            ? res.headers.get('Retry-After')
            : null;
        throw failed(new ApiError(label, serverMessage !== null && serverMessage !== void 0 ? serverMessage : `${label}: HTTP ${res.status}`, res.status, (_d = parseRetryAfterSeconds(retryHeader)) !== null && _d !== void 0 ? _d : bodyRetryAfter), opts.method, url, startedAt, res);
    }
    if (!text.trim()) {
        apiSucceeded(opts.method, url, res.status);
        return undefined;
    }
    let parsed;
    try {
        parsed = JSON.parse(text);
    }
    catch (_f) {
        throw failed(new ApiError(label, `${label}: response was not valid JSON`, res.status), opts.method, url, startedAt, res);
    }
    apiSucceeded(opts.method, url, res.status);
    return parsed;
}
/**
 * Defensive text coercion, homed here so every surface handles response-shape
 * quirks the same way. Coerce before trimming: joined API rows occasionally
 * carry a non-string in a field treated as text (e.g. a boolean `attending`),
 * and a bare `.trim()` on it throws — the failure class behind admin#69's
 * forever-spinner.
 */
export const clean = (v) => (v == null ? '' : String(v)).trim();
/**
 * Envelope coercion: accepts a bare array or an `{ items: [...] }` wrapper and
 * always returns a real array — anything else (error object, null, off-shape
 * envelope) becomes [] so a single bad read degrades its slice instead of
 * throwing out of the screen's view-model join.
 */
export const asArray = (v) => {
    if (Array.isArray(v))
        return v;
    const items = v === null || v === void 0 ? void 0 : v.items;
    return Array.isArray(items) ? items : [];
};
/**
 * The loading/error contract, as a plain function so the guarantee is testable
 * without React: run the loader (fetches AND the view-model transform — so a
 * bad field surfaces as an error state, not a hang), report the result through
 * `set`, and ALWAYS clear isLoading via finally. hooks/useGuardedLoad binds
 * this to component state.
 */
export async function runGuarded(load, set, errorMessage) {
    set({ data: null, isLoading: true, error: null });
    let data = null;
    let error = null;
    try {
        data = await load();
    }
    catch (e) {
        console.error(`data: guarded load failed (${errorMessage}):`, e);
        if (!(e instanceof ApiError))
            apiCaught(errorMessage, e);
        error = errorMessage;
    }
    finally {
        set({ data, isLoading: false, error });
    }
}
