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

import { ApiFailure, observeApiCalls } from './apiObserver';

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
  auth?: { hasToken: boolean; expiresInS?: number };
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
  auth?: { hasToken: boolean; expiresInS?: number };
  online?: boolean;
  ua?: string;
  /**
   * True when the page is driven by automation (`navigator.webdriver`, which
   * Playwright sets in every engine). The triage job files a report from a
   * person on first sight and holds automated ones to its recurrence
   * thresholds — the e2e suite runs the real apps every few hours and must
   * never look like a user (cdk#1494).
   */
  automated: boolean;
}

export const MAX_REPORTS_PER_SESSION = 20;
export const MAX_BREADCRUMBS = 20;
export const MAX_BATCH = 10;
export const FLUSH_DELAY_MS = 5_000;
/** Server-side cap is 32 KiB per batch; keep one report well under it. */
export const MAX_REPORT_BYTES = 8 * 1024;
const MAX_STACK_FRAMES = 10;
const MAX_TEXT = 500;

interface ReporterState {
  config: ReporterConfig | null;
  sessionId: string;
  breadcrumbs: Breadcrumb[];
  queue: ErrorReport[];
  /** Reports accepted this session (queued or already sent) — the cap counts both. */
  accepted: number;
  seen: Set<string>;
  timer: ReturnType<typeof setTimeout> | null;
}

/** `navigator.webdriver` is the automation flag every engine exposes; absent (a worker, a test) reads as a person. */
const isAutomated = (): boolean => {
  try {
    const nav = (globalThis as { navigator?: { webdriver?: unknown } }).navigator;
    return nav?.webdriver === true;
  } catch {
    return false;
  }
};

const newSessionId = (): string => {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  return `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
};

const freshState = (): ReporterState => ({
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
export const scrub = (text: string): string =>
  text
    .replace(/\bBearer\s+\S+/gi, '[token]')
    .replace(/\b[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g, '[token]')
    .replace(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, '[email]')
    .slice(0, MAX_TEXT);

// A path segment that is an identifier rather than a resource name: a uuid,
// a hex/digit run, or a long opaque token. `/events/{eventId}/rsvp` and
// `/events/2f853dbf-…/rsvp` must fingerprint the same.
const ID_SEGMENT = /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[0-9a-f]{12,}|\d+|[A-Za-z0-9_-]{20,})$/i;

/** The URL's path with identifier segments replaced by `{id}`, no host, no query. */
export const routeTemplate = (url: string): string => {
  let path = url;
  try {
    path = new URL(url).pathname;
  } catch {
    path = url.split('?')[0].split('#')[0];
  }
  return path
    .split('/')
    .map((seg) => (ID_SEGMENT.test(seg) ? '{id}' : seg))
    .join('/');
};

// Vite emits `chunk-a1b2c3d4.js`; the hash changes per release while the bug
// does not, so it is stripped along with line:column before hashing.
const normalizeFrame = (frame: string): string =>
  frame.trim().replace(/-[A-Za-z0-9_]{6,12}\.js/g, '.js').replace(/:\d+(?::\d+)?\)?$/, '');

const stackFrames = (stack: string | undefined): string[] | undefined => {
  if (!stack) return undefined;
  const frames = stack.split('\n').map((l) => l.trim()).filter(Boolean).slice(0, MAX_STACK_FRAMES);
  return frames.length ? frames.map(scrub) : undefined;
};

// djb2 — tiny, stable across engines, good enough to key an issue on.
const hash = (s: string): string => {
  let h = 5381;
  for (let i = 0; i < s.length; i += 1) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(16).padStart(8, '0');
};

/**
 * What "the same bug" means: for API failures the call and its status; for
 * everything else the error's name plus its first meaningful frame (or, with
 * no stack, the digit-stripped head of the message). Release is deliberately
 * NOT in the key — the nightly job reports it per issue instead.
 */
export const fingerprintOf = (
  app: string,
  kind: ReportKind,
  f: { name?: string; label?: string; method?: string; routeTemplate?: string; status?: number;
       message: string; stack?: string[] },
): string => {
  const parts = [app, kind];
  if (kind === 'api') {
    parts.push(f.label ?? '', f.method ?? '', f.routeTemplate ?? '', String(f.status ?? 'net'));
  } else {
    // The label (a cache key, a guarded load's message) separates two
    // swallow sites that share one throwing function.
    parts.push(f.name ?? '', f.label ?? '');
    const frame = f.stack?.find((l) => /^at |@/.test(l));
    parts.push(frame ? normalizeFrame(frame) : f.message.replace(/\d+/g, '#').slice(0, 60));
  }
  return hash(parts.join('|'));
};

const bytesOf = (r: ErrorReport): number => JSON.stringify(r).length;

/**
 * Shrink a report that would blow the per-report cap by dropping the oldest
 * breadcrumbs. Every other field is already bounded (frames and text are
 * capped at scrub time), so once the crumbs are gone the report fits.
 */
const fit = (r: ErrorReport): ErrorReport => {
  const out = { ...r };
  while (bytesOf(out) > MAX_REPORT_BYTES && out.breadcrumbs.length) {
    out.breadcrumbs = out.breadcrumbs.slice(1);
  }
  return out;
};

/**
 * Configure the reporter for this page load and attach it to the data layer's
 * observer seam. Idempotent; a second call replaces the config.
 */
export const initReporter = (config: ReporterConfig): void => {
  state.config = config;
  observeApiCalls({ failure: reportApiFailure, success: noteApiCall, caught: reportCaught });
};

/** Test seam: drop config, buffer, crumbs, the session and the observer — a fresh page load. */
export const resetReporter = (): void => {
  if (state.timer) clearTimeout(state.timer);
  state = freshState();
  observeApiCalls(null);
};

/** Snapshot for tests and for the app's own diagnostics surface. */
export const reporterSnapshot = () => ({
  sessionId: state.sessionId,
  queued: state.queue.length,
  accepted: state.accepted,
  breadcrumbs: [...state.breadcrumbs],
});

export const addBreadcrumb = (crumb: Omit<Breadcrumb, 't'> & { t?: number }): void => {
  const detail = scrub(crumb.detail).slice(0, 120);
  state.breadcrumbs.push({ ...crumb, detail, t: crumb.t ?? Date.now() });
  if (state.breadcrumbs.length > MAX_BREADCRUMBS) state.breadcrumbs.shift();
};

const send = (batch: ErrorReport[]): void => {
  const endpoint = state.config?.endpoint;
  if (!endpoint || typeof fetch !== 'function') return;
  try {
    // keepalive: the batch survives the page unloading beneath it (pagehide flush).
    // NOT sendJson — the reporter must never observe its own failures.
    void fetch(endpoint, {
      method: 'POST',
      keepalive: true,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reports: batch }),
    }).catch(() => undefined);
  } catch {
    /* a synchronous fetch throw (bad URL) is dropped like any other transport failure */
  }
};

/** Send everything queued now (the app calls this on pagehide). */
export const flushReports = (): void => {
  if (state.timer) {
    clearTimeout(state.timer);
    state.timer = null;
  }
  while (state.queue.length) send(state.queue.splice(0, MAX_BATCH));
};

const schedule = (): void => {
  if (state.queue.length >= MAX_BATCH) {
    flushReports();
    return;
  }
  if (!state.timer) state.timer = setTimeout(flushReports, FLUSH_DELAY_MS);
};

/**
 * Record one failure. Safe to call from anywhere, any time: before init it is
 * a no-op, past the per-session cap it is a no-op, a repeat of a fingerprint
 * already reported this session is a no-op. Never throws.
 */
export const report = (kind: ReportKind, fields: ReportFields): void => {
  try {
    const cfg = state.config;
    if (!cfg || state.accepted >= MAX_REPORTS_PER_SESSION) return;
    const ctx = cfg.context ? cfg.context() : {};
    const stack = stackFrames(fields.stack);
    const template = fields.url ? routeTemplate(fields.url) : undefined;
    const message = scrub(fields.message);
    const fingerprint = fingerprintOf(cfg.app, kind, {
      name: fields.name, label: fields.label, method: fields.method,
      routeTemplate: template, status: fields.status, message, stack,
    });
    if (state.seen.has(fingerprint)) return;
    state.seen.add(fingerprint);
    const r: ErrorReport = fit({
      v: 1,
      kind,
      app: cfg.app,
      release: cfg.release,
      sessionId: state.sessionId,
      fingerprint,
      t: new Date().toISOString(),
      message,
      // Every free-text field goes through `scrub`, not only the ones a
      // human writes: a thrown value's name, a label, a request id echoed by
      // a proxy, a path segment, the UA string — any of them can carry an
      // address or a token (Codex r2 on #162 found name/label/requestId/
      // route/ua/eventId/routeTemplate went out verbatim).
      ...(fields.name ? { name: scrub(fields.name) } : {}),
      ...(fields.label ? { label: scrub(fields.label) } : {}),
      ...(fields.method ? { method: fields.method } : {}),
      ...(template ? { routeTemplate: scrub(template) } : {}),
      ...(fields.status !== undefined ? { status: fields.status } : {}),
      ...(fields.requestId ? { requestId: scrub(fields.requestId) } : {}),
      ...(fields.durationMs !== undefined ? { durationMs: fields.durationMs } : {}),
      ...(stack ? { stack } : {}),
      ...(fields.componentStack ? { componentStack: scrub(fields.componentStack) } : {}),
      breadcrumbs: [...state.breadcrumbs],
      automated: isAutomated(),
      ...(ctx.route ? { route: scrub(routeTemplate(ctx.route)) } : {}),
      ...(ctx.eventId ? { eventId: scrub(ctx.eventId) } : {}),
      ...(ctx.auth ? { auth: ctx.auth } : {}),
      ...(ctx.online !== undefined ? { online: ctx.online } : {}),
      ...(ctx.ua ? { ua: scrub(ctx.ua).slice(0, 200) } : {}),
    });
    state.queue.push(r);
    state.accepted += 1;
    schedule();
  } catch {
    /* the reporter never becomes the error */
  }
};

/** A failed data-layer call: the crumb everyone else's report will show, plus its own report. */
export const reportApiFailure = (f: ApiFailure): void => {
  addBreadcrumb({ type: 'api', detail: `${f.method} ${routeTemplate(f.url)}`, status: f.status });
  report('api', {
    message: f.message, name: 'ApiError', label: f.label, method: f.method, url: f.url,
    status: f.status, requestId: f.requestId, durationMs: f.durationMs,
  });
};

/** A successful data-layer call leaves only a crumb. */
export const noteApiCall = (method: string, url: string, status: number): void => {
  addBreadcrumb({ type: 'api', detail: `${method} ${routeTemplate(url)}`, status });
};

/** A caught, non-ApiError failure at a swallow site (a view-model transform throwing). */
export const reportCaught = (label: string, e: unknown): void => {
  const err = e instanceof Error ? e : undefined;
  report('caught', {
    message: err?.message ?? String(e),
    name: err?.name,
    label,
    stack: err?.stack,
  });
};
