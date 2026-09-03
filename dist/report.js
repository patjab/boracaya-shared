"use strict";
// The client error reporter (cdk#1495, epic cdk#1494): ONE funnel every
// browser-side failure passes through — the ApiError throw sites in data.ts,
// the swallow sites in data.ts/cache.ts, ErrorBoundary.componentDidCatch, and
// the window error/rejection handlers the app installs (browser.ts). Each
// report carries what an agent needs to act on it without a human writing
// repro steps: app, release, route, eventId, auth state, a per-page-load
// session id, the backend request id of the failing response, and a ring
// buffer of breadcrumbs (route changes, API calls, clicks by accessible name).
//
// Plain TypeScript, DOM-free by design: no `window`, no `navigator` — the app
// hands in page context through `initReporter({ context })`, and the
// window-touching for the global handlers lives in browser.ts (cdk#1107). That
// keeps this module importable from data.ts without dragging the browser
// adapter into the Node/bootstrap consumer graphs (scripts/check-consumer-exports).
//
// PII rule (#933) enforced HERE, not by callers: the report shape is a fixed
// key allowlist, and every free-text field passes through `scrub`, which
// redacts email-shaped and token-shaped substrings. Never add a field that
// could carry an email, a name, an IP, or a bearer token.
//
// Failure posture: `report()` never throws and never blocks its caller. A
// failing telemetry POST is dropped — not retried, not logged as another
// report — so the reporter can never become the outage it exists to record.
Object.defineProperty(exports, "__esModule", { value: true });
exports.reportCaught = exports.noteApiCall = exports.reportApiFailure = exports.report = exports.flushReports = exports.addBreadcrumb = exports.reporterSnapshot = exports.resetReporter = exports.initReporter = exports.fingerprintOf = exports.routeTemplate = exports.scrub = exports.MAX_REPORT_BYTES = exports.FLUSH_DELAY_MS = exports.MAX_BATCH = exports.MAX_BREADCRUMBS = exports.MAX_REPORTS_PER_SESSION = void 0;
const apiObserver_1 = require("./apiObserver");
exports.MAX_REPORTS_PER_SESSION = 20;
exports.MAX_BREADCRUMBS = 20;
exports.MAX_BATCH = 10;
exports.FLUSH_DELAY_MS = 5000;
/** Server-side cap is 32 KiB per batch; keep one report well under it. */
exports.MAX_REPORT_BYTES = 8 * 1024;
const MAX_STACK_FRAMES = 10;
const MAX_TEXT = 500;
const newSessionId = () => {
    const c = globalThis.crypto;
    if (c && typeof c.randomUUID === 'function')
        return c.randomUUID();
    return `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
};
const freshState = () => ({
    config: null,
    sessionId: newSessionId(),
    breadcrumbs: [],
    queue: [],
    accepted: 0,
    seen: new Set(),
    timer: null,
});
let state = freshState();
/**
 * Redact anything that could identify a person or carry a credential. Applied
 * to every free-text field. Order matters: a JWT contains no '@', an email no
 * dots-between-base64 — but "Bearer x.y.z" must go as a whole before the JWT
 * rule leaves a bare "Bearer" behind.
 */
const scrub = (text) => text
    .replace(/\bBearer\s+\S+/gi, '[token]')
    .replace(/\b[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g, '[token]')
    .replace(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, '[email]')
    .slice(0, MAX_TEXT);
exports.scrub = scrub;
// A path segment that is an identifier rather than a resource name: a uuid,
// a hex/digit run, or a long opaque token. `/events/{eventId}/rsvp` and
// `/events/2f853dbf-…/rsvp` must fingerprint the same.
const ID_SEGMENT = /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[0-9a-f]{12,}|\d+|[A-Za-z0-9_-]{20,})$/i;
/** The URL's path with identifier segments replaced by `{id}`, no host, no query. */
const routeTemplate = (url) => {
    let path = url;
    try {
        path = new URL(url).pathname;
    }
    catch (_a) {
        path = url.split('?')[0].split('#')[0];
    }
    return path
        .split('/')
        .map((seg) => (ID_SEGMENT.test(seg) ? '{id}' : seg))
        .join('/');
};
exports.routeTemplate = routeTemplate;
// Vite emits `chunk-a1b2c3d4.js`; the hash changes per release while the bug
// does not, so it is stripped along with line:column before hashing.
const normalizeFrame = (frame) => frame.trim().replace(/-[A-Za-z0-9_]{6,12}\.js/g, '.js').replace(/:\d+(?::\d+)?\)?$/, '');
const stackFrames = (stack) => {
    if (!stack)
        return undefined;
    const frames = stack.split('\n').map((l) => l.trim()).filter(Boolean).slice(0, MAX_STACK_FRAMES);
    return frames.length ? frames.map(exports.scrub) : undefined;
};
// djb2 — tiny, stable across engines, good enough to key an issue on.
const hash = (s) => {
    let h = 5381;
    for (let i = 0; i < s.length; i += 1)
        h = ((h << 5) + h + s.charCodeAt(i)) | 0;
    return (h >>> 0).toString(16).padStart(8, '0');
};
/**
 * What "the same bug" means: for API failures the call and its status; for
 * everything else the error's name plus its first meaningful frame (or, with
 * no stack, the digit-stripped head of the message). Release is deliberately
 * NOT in the key — the nightly job reports it per issue instead.
 */
const fingerprintOf = (app, kind, f) => {
    var _a, _b, _c, _d, _e, _f, _g;
    const parts = [app, kind];
    if (kind === 'api') {
        parts.push((_a = f.label) !== null && _a !== void 0 ? _a : '', (_b = f.method) !== null && _b !== void 0 ? _b : '', (_c = f.routeTemplate) !== null && _c !== void 0 ? _c : '', String((_d = f.status) !== null && _d !== void 0 ? _d : 'net'));
    }
    else {
        // The label (a cache key, a guarded load's message) separates two
        // swallow sites that share one throwing function.
        parts.push((_e = f.name) !== null && _e !== void 0 ? _e : '', (_f = f.label) !== null && _f !== void 0 ? _f : '');
        const frame = (_g = f.stack) === null || _g === void 0 ? void 0 : _g.find((l) => /^at |@/.test(l));
        parts.push(frame ? normalizeFrame(frame) : f.message.replace(/\d+/g, '#').slice(0, 60));
    }
    return hash(parts.join('|'));
};
exports.fingerprintOf = fingerprintOf;
const bytesOf = (r) => JSON.stringify(r).length;
/**
 * Shrink a report that would blow the per-report cap by dropping the oldest
 * breadcrumbs. Every other field is already bounded (frames and text are
 * capped at scrub time), so once the crumbs are gone the report fits.
 */
const fit = (r) => {
    const out = { ...r };
    while (bytesOf(out) > exports.MAX_REPORT_BYTES && out.breadcrumbs.length) {
        out.breadcrumbs = out.breadcrumbs.slice(1);
    }
    return out;
};
/**
 * Configure the reporter for this page load and attach it to the data layer's
 * observer seam. Idempotent; a second call replaces the config.
 */
const initReporter = (config) => {
    state.config = config;
    (0, apiObserver_1.observeApiCalls)({ failure: exports.reportApiFailure, success: exports.noteApiCall, caught: exports.reportCaught });
};
exports.initReporter = initReporter;
/** Test seam: drop config, buffer, crumbs, the session and the observer — a fresh page load. */
const resetReporter = () => {
    if (state.timer)
        clearTimeout(state.timer);
    state = freshState();
    (0, apiObserver_1.observeApiCalls)(null);
};
exports.resetReporter = resetReporter;
/** Snapshot for tests and for the app's own diagnostics surface. */
const reporterSnapshot = () => ({
    sessionId: state.sessionId,
    queued: state.queue.length,
    accepted: state.accepted,
    breadcrumbs: [...state.breadcrumbs],
});
exports.reporterSnapshot = reporterSnapshot;
const addBreadcrumb = (crumb) => {
    var _a;
    const detail = (0, exports.scrub)(crumb.detail).slice(0, 120);
    state.breadcrumbs.push({ ...crumb, detail, t: (_a = crumb.t) !== null && _a !== void 0 ? _a : Date.now() });
    if (state.breadcrumbs.length > exports.MAX_BREADCRUMBS)
        state.breadcrumbs.shift();
};
exports.addBreadcrumb = addBreadcrumb;
const send = (batch) => {
    var _a;
    const endpoint = (_a = state.config) === null || _a === void 0 ? void 0 : _a.endpoint;
    if (!endpoint || typeof fetch !== 'function')
        return;
    try {
        // keepalive: the batch survives the page unloading beneath it (pagehide flush).
        // NOT sendJson — the reporter must never observe its own failures.
        void fetch(endpoint, {
            method: 'POST',
            keepalive: true,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ reports: batch }),
        }).catch(() => undefined);
    }
    catch (_b) {
        /* a synchronous fetch throw (bad URL) is dropped like any other transport failure */
    }
};
/** Send everything queued now (the app calls this on pagehide). */
const flushReports = () => {
    if (state.timer) {
        clearTimeout(state.timer);
        state.timer = null;
    }
    while (state.queue.length)
        send(state.queue.splice(0, exports.MAX_BATCH));
};
exports.flushReports = flushReports;
const schedule = () => {
    if (state.queue.length >= exports.MAX_BATCH) {
        (0, exports.flushReports)();
        return;
    }
    if (!state.timer)
        state.timer = setTimeout(exports.flushReports, exports.FLUSH_DELAY_MS);
};
/**
 * Record one failure. Safe to call from anywhere, any time: before init it is
 * a no-op, past the per-session cap it is a no-op, a repeat of a fingerprint
 * already reported this session is a no-op. Never throws.
 */
const report = (kind, fields) => {
    try {
        const cfg = state.config;
        if (!cfg || state.accepted >= exports.MAX_REPORTS_PER_SESSION)
            return;
        const ctx = cfg.context ? cfg.context() : {};
        const stack = stackFrames(fields.stack);
        const template = fields.url ? (0, exports.routeTemplate)(fields.url) : undefined;
        const message = (0, exports.scrub)(fields.message);
        const fingerprint = (0, exports.fingerprintOf)(cfg.app, kind, {
            name: fields.name, label: fields.label, method: fields.method,
            routeTemplate: template, status: fields.status, message, stack,
        });
        if (state.seen.has(fingerprint))
            return;
        state.seen.add(fingerprint);
        const r = fit({
            v: 1,
            kind,
            app: cfg.app,
            release: cfg.release,
            sessionId: state.sessionId,
            fingerprint,
            t: new Date().toISOString(),
            message,
            ...(fields.name ? { name: fields.name } : {}),
            ...(fields.label ? { label: fields.label } : {}),
            ...(fields.method ? { method: fields.method } : {}),
            ...(template ? { routeTemplate: template } : {}),
            ...(fields.status !== undefined ? { status: fields.status } : {}),
            ...(fields.requestId ? { requestId: fields.requestId } : {}),
            ...(fields.durationMs !== undefined ? { durationMs: fields.durationMs } : {}),
            ...(stack ? { stack } : {}),
            ...(fields.componentStack ? { componentStack: (0, exports.scrub)(fields.componentStack) } : {}),
            breadcrumbs: [...state.breadcrumbs],
            ...(ctx.route ? { route: (0, exports.routeTemplate)(ctx.route) } : {}),
            ...(ctx.eventId ? { eventId: ctx.eventId } : {}),
            ...(ctx.auth ? { auth: ctx.auth } : {}),
            ...(ctx.online !== undefined ? { online: ctx.online } : {}),
            ...(ctx.ua ? { ua: ctx.ua.slice(0, 200) } : {}),
        });
        state.queue.push(r);
        state.accepted += 1;
        schedule();
    }
    catch (_a) {
        /* the reporter never becomes the error */
    }
};
exports.report = report;
/** A failed data-layer call: the crumb everyone else's report will show, plus its own report. */
const reportApiFailure = (f) => {
    (0, exports.addBreadcrumb)({ type: 'api', detail: `${f.method} ${(0, exports.routeTemplate)(f.url)}`, status: f.status });
    (0, exports.report)('api', {
        message: f.message, name: 'ApiError', label: f.label, method: f.method, url: f.url,
        status: f.status, requestId: f.requestId, durationMs: f.durationMs,
    });
};
exports.reportApiFailure = reportApiFailure;
/** A successful data-layer call leaves only a crumb. */
const noteApiCall = (method, url, status) => {
    (0, exports.addBreadcrumb)({ type: 'api', detail: `${method} ${(0, exports.routeTemplate)(url)}`, status });
};
exports.noteApiCall = noteApiCall;
/** A caught, non-ApiError failure at a swallow site (a view-model transform throwing). */
const reportCaught = (label, e) => {
    var _a;
    const err = e instanceof Error ? e : undefined;
    (0, exports.report)('caught', {
        message: (_a = err === null || err === void 0 ? void 0 : err.message) !== null && _a !== void 0 ? _a : String(e),
        name: err === null || err === void 0 ? void 0 : err.name,
        label,
        stack: err === null || err === void 0 ? void 0 : err.stack,
    });
};
exports.reportCaught = reportCaught;
