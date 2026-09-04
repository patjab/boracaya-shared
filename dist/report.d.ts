import { ApiFailure } from './apiObserver';
export type ReportKind = 'api' | 'render' | 'uncaught' | 'rejection' | 'caught';
export type BreadcrumbType = 'route' | 'api' | 'click' | 'auth' | 'note';
export interface Breadcrumb {
    /** ms since epoch */
    t: number;
    type: BreadcrumbType;
    /** Short, PII-free detail: a route, `GET /events/{id}/rsvp`, an accessible name. */
    detail: string;
    /** HTTP status on `api` crumbs. */
    status?: number;
}
/** Page context the app supplies per report (read fresh each time). */
export interface ReportContext {
    route?: string;
    eventId?: string;
    auth?: {
        hasToken: boolean;
        expiresInS?: number;
    };
    online?: boolean;
    ua?: string;
}
export interface ReporterConfig {
    /** 'valet' | 'shore' — the reporting app. */
    app: string;
    /** Build identity (the deploying commit SHA); 'local' outside CI. */
    release: string;
    /** Where batches POST. Unset => reports are buffered but never sent. */
    endpoint?: string;
    /** Fresh page context per report; the app's browser adapter supplies it. */
    context?: () => ReportContext;
}
/** Fields a caller may attach; everything else is dropped by the allowlist. */
export interface ReportFields {
    message: string;
    name?: string;
    /** The data-layer call label ("invites", "save template"). */
    label?: string;
    method?: string;
    /** The URL the call went to — reduced to a route template before it is stored. */
    url?: string;
    status?: number;
    /** `x-amzn-RequestId` of the failing response — the join key to backend logs. */
    requestId?: string;
    durationMs?: number;
    /** Raw stack text; reduced to the first frames, normalized. */
    stack?: string;
    componentStack?: string;
}
/** One line in the client-errors log group. `v` is the schema version. */
export interface ErrorReport {
    v: 1;
    kind: ReportKind;
    app: string;
    release: string;
    sessionId: string;
    fingerprint: string;
    t: string;
    message: string;
    name?: string;
    label?: string;
    method?: string;
    routeTemplate?: string;
    status?: number;
    requestId?: string;
    durationMs?: number;
    stack?: string[];
    componentStack?: string;
    breadcrumbs: Breadcrumb[];
    route?: string;
    eventId?: string;
    auth?: {
        hasToken: boolean;
        expiresInS?: number;
    };
    online?: boolean;
    ua?: string;
}
export declare const MAX_REPORTS_PER_SESSION = 20;
export declare const MAX_BREADCRUMBS = 20;
export declare const MAX_BATCH = 10;
export declare const FLUSH_DELAY_MS = 5000;
/** Server-side cap is 32 KiB per batch; keep one report well under it. */
export declare const MAX_REPORT_BYTES: number;
/**
 * Redact anything that could identify a person or carry a credential. Applied
 * to every free-text field. Order matters: a JWT contains no '@', an email no
 * dots-between-base64 — but "Bearer x.y.z" must go as a whole before the JWT
 * rule leaves a bare "Bearer" behind.
 */
export declare const scrub: (text: string) => string;
/** The URL's path with identifier segments replaced by `{id}`, no host, no query. */
export declare const routeTemplate: (url: string) => string;
/**
 * What "the same bug" means: for API failures the call and its status; for
 * everything else the error's name plus its first meaningful frame (or, with
 * no stack, the digit-stripped head of the message). Release is deliberately
 * NOT in the key — the nightly job reports it per issue instead.
 */
export declare const fingerprintOf: (app: string, kind: ReportKind, f: {
    name?: string;
    label?: string;
    method?: string;
    routeTemplate?: string;
    status?: number;
    message: string;
    stack?: string[];
}) => string;
/**
 * Configure the reporter for this page load and attach it to the data layer's
 * observer seam. Idempotent; a second call replaces the config.
 */
export declare const initReporter: (config: ReporterConfig) => void;
/** Test seam: drop config, buffer, crumbs, the session and the observer — a fresh page load. */
export declare const resetReporter: () => void;
/** Snapshot for tests and for the app's own diagnostics surface. */
export declare const reporterSnapshot: () => {
    sessionId: string;
    queued: number;
    accepted: number;
    breadcrumbs: Breadcrumb[];
};
export declare const addBreadcrumb: (crumb: Omit<Breadcrumb, "t"> & {
    t?: number;
}) => void;
/** Send everything queued now (the app calls this on pagehide). */
export declare const flushReports: () => void;
/**
 * Record one failure. Safe to call from anywhere, any time: before init it is
 * a no-op, past the per-session cap it is a no-op, a repeat of a fingerprint
 * already reported this session is a no-op. Never throws.
 */
export declare const report: (kind: ReportKind, fields: ReportFields) => void;
/** A failed data-layer call: the crumb everyone else's report will show, plus its own report. */
export declare const reportApiFailure: (f: ApiFailure) => void;
/** A successful data-layer call leaves only a crumb. */
export declare const noteApiCall: (method: string, url: string, status: number) => void;
/** A caught, non-ApiError failure at a swallow site (a view-model transform throwing). */
export declare const reportCaught: (label: string, e: unknown) => void;
