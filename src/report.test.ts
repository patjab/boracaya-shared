import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  FLUSH_DELAY_MS, MAX_BATCH, MAX_BREADCRUMBS, MAX_REPORTS_PER_SESSION, MAX_REPORT_BYTES,
  addBreadcrumb, fingerprintOf, flushReports, initReporter, report, reportCaught,
  reporterSnapshot, resetReporter, routeTemplate, scrub,
} from './report';

const ENDPOINT = 'https://public-api.test.boracaya.com/telemetry/errors';

const fetchMock = () => fetch as unknown as ReturnType<typeof vi.fn>;
const sentBatches = () => fetchMock().mock.calls.map(
  (c) => JSON.parse((c[1] as RequestInit).body as string).reports as Array<Record<string, unknown>>,
);

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 204 })));
  resetReporter();
  initReporter({ app: 'valet', release: 'abc123', endpoint: ENDPOINT,
    context: () => ({ route: '/events/2f853dbf-82b2-4780-8a5a-8bc4029dd1f5/rsvp', eventId: 'evt-1',
      auth: { hasToken: true, expiresInS: 120 }, online: true, ua: 'UA' }) });
});

afterEach(() => {
  resetReporter();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('scrub', () => {
  it('redacts emails, JWTs and bearer tokens', () => {
    const jwt = 'eyJhbGciOiJSUzI1NiIs.eyJlbWFpbCI6ImFAYi5jb20ifQ.c2lnbmF0dXJlLXNpZ25hdHVyZQ';
    expect(scrub(`sent to alex.smith+x@example.co.uk with ${jwt}`)).toBe('sent to [email] with [token]');
    expect(scrub('Authorization: Bearer abc.def.ghi failed')).toBe('Authorization: [token] failed');
  });
  it('caps length', () => {
    expect(scrub('x'.repeat(2000)).length).toBe(500);
  });
});

describe('routeTemplate', () => {
  it('drops the host and query and replaces identifier segments', () => {
    expect(routeTemplate('https://valet-api.boracaya.com/events/2f853dbf-82b2-4780-8a5a-8bc4029dd1f5/stages/PRECHECKIN/responses/9a8b7c6d5e4f3a2b?x=1'))
      .toBe('/events/{id}/stages/PRECHECKIN/responses/{id}');
    expect(routeTemplate('/events/42/members/alex-and-alexa-2026-wedding-planner')).toBe('/events/{id}/members/{id}');
  });
  it('tolerates a bare path', () => {
    expect(routeTemplate('/accounts/me#top')).toBe('/accounts/me');
  });
});

describe('fingerprintOf', () => {
  it('keys api failures on call + status, not on the message', () => {
    const a = fingerprintOf('valet', 'api', { label: 'invites', method: 'GET', routeTemplate: '/events/{id}/invites', status: 401, message: 'HTTP 401 at 12:00' });
    const b = fingerprintOf('valet', 'api', { label: 'invites', method: 'GET', routeTemplate: '/events/{id}/invites', status: 401, message: 'HTTP 401 at 13:00' });
    const c = fingerprintOf('valet', 'api', { label: 'invites', method: 'GET', routeTemplate: '/events/{id}/invites', status: 503, message: 'x' });
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a).toMatch(/^[0-9a-f]{8}$/);
  });
  it('keys render errors on name + first frame with the chunk hash and line numbers stripped', () => {
    const a = fingerprintOf('shore', 'render', { name: 'TypeError', message: 'x', stack: ['TypeError: x', 'at render (https://x/assets/index-a1b2c3d4.js:1:2345)'] });
    const b = fingerprintOf('shore', 'render', { name: 'TypeError', message: 'y', stack: ['TypeError: y', 'at render (https://x/assets/index-ffeeddcc.js:9:1)'] });
    expect(a).toBe(b);
  });
  it('falls back to the digit-stripped message when there is no frame', () => {
    const a = fingerprintOf('shore', 'uncaught', { message: 'row 12 missing' });
    const b = fingerprintOf('shore', 'uncaught', { message: 'row 99 missing' });
    expect(a).toBe(b);
  });
});

describe('report', () => {
  it('is a no-op before init and never throws', () => {
    resetReporter();
    expect(() => report('api', { message: 'x' })).not.toThrow();
    expect(reporterSnapshot().queued).toBe(0);
  });

  it('builds the allowlisted shape with context, crumbs, scrubbed text and the request id', () => {
    addBreadcrumb({ type: 'route', detail: '/events/evt-1/rsvp' });
    addBreadcrumb({ type: 'click', detail: 'Save alex@example.com' });
    report('api', { message: 'invites: HTTP 401 for alex@example.com', name: 'ApiError', label: 'invites',
      method: 'GET', url: 'https://valet-api.boracaya.com/events/2f853dbf-82b2-4780-8a5a-8bc4029dd1f5/invites',
      status: 401, requestId: 'req-1', durationMs: 42, stack: 'ApiError: x\n  at getJson (data.js:1:1)' });
    flushReports();
    const [batch] = sentBatches();
    expect(batch).toHaveLength(1);
    const r = batch[0];
    expect(r).toMatchObject({
      v: 1, kind: 'api', app: 'valet', release: 'abc123', name: 'ApiError', label: 'invites', method: 'GET',
      routeTemplate: '/events/{id}/invites', status: 401, requestId: 'req-1', durationMs: 42,
      message: 'invites: HTTP 401 for [email]', route: '/events/{id}/rsvp', eventId: 'evt-1',
      auth: { hasToken: true, expiresInS: 120 }, online: true, ua: 'UA',
    });
    expect(r.sessionId).toBe(reporterSnapshot().sessionId);
    expect(r.fingerprint).toMatch(/^[0-9a-f]{8}$/);
    expect(r.stack).toEqual(['ApiError: x', 'at getJson (data.js:1:1)']);
    expect(r.breadcrumbs).toEqual([
      expect.objectContaining({ type: 'route', detail: '/events/evt-1/rsvp' }),
      expect.objectContaining({ type: 'click', detail: 'Save [email]' }),
    ]);
    expect(JSON.stringify(r)).not.toContain('example.com');
    expect(fetchMock().mock.calls[0][0]).toBe(ENDPOINT);
    expect((fetchMock().mock.calls[0][1] as RequestInit).keepalive).toBe(true);
  });

  it('omits absent optional fields and context', () => {
    initReporter({ app: 'shore', release: 'local', endpoint: ENDPOINT });
    report('uncaught', { message: 'boom' });
    flushReports();
    const r = sentBatches()[0][0];
    expect(Object.keys(r).sort()).toEqual(['app', 'breadcrumbs', 'fingerprint', 'kind', 'message', 'release', 'sessionId', 't', 'v']);
  });

  it('dedupes a fingerprint within the session and caps the session', () => {
    for (let i = 0; i < 3; i += 1) report('api', { message: `m${i}`, label: 'x', method: 'GET', url: '/a', status: 500 });
    expect(reporterSnapshot().queued).toBe(1);
    for (let i = 0; i < MAX_REPORTS_PER_SESSION + 5; i += 1) report('api', { message: 'm', label: `l${i}`, method: 'GET', url: '/a', status: 500 });
    flushReports();
    expect(sentBatches().flat()).toHaveLength(MAX_REPORTS_PER_SESSION);
  });

  it('batches on a timer and flushes early at the batch size', () => {
    report('api', { message: 'a', label: 'a', status: 500 });
    expect(fetchMock()).not.toHaveBeenCalled();
    vi.advanceTimersByTime(FLUSH_DELAY_MS);
    expect(fetchMock()).toHaveBeenCalledTimes(1);
    for (let i = 0; i < MAX_BATCH; i += 1) report('api', { message: 'b', label: `b${i}`, status: 500 });
    expect(fetchMock()).toHaveBeenCalledTimes(2);
    expect(sentBatches()[1]).toHaveLength(MAX_BATCH);
  });

  it('keeps the breadcrumb ring at its cap', () => {
    for (let i = 0; i < MAX_BREADCRUMBS + 7; i += 1) addBreadcrumb({ type: 'note', detail: `n${i}` });
    const crumbs = reporterSnapshot().breadcrumbs;
    expect(crumbs).toHaveLength(MAX_BREADCRUMBS);
    expect(crumbs[0].detail).toBe('n7');
  });

  it('shrinks an oversized report by dropping the oldest breadcrumbs', () => {
    for (let i = 0; i < MAX_BREADCRUMBS; i += 1) addBreadcrumb({ type: 'note', detail: `${i}-${'x'.repeat(115)}` });
    const stack = Array.from({ length: 10 }, (_, i) => `at f${i} (${'y'.repeat(450)}:1:1)`).join('\n');
    report('render', { message: 'big', stack, componentStack: 'c'.repeat(600) });
    flushReports();
    const r = sentBatches()[0][0];
    expect(JSON.stringify(r).length).toBeLessThanOrEqual(MAX_REPORT_BYTES);
    const crumbs = r.breadcrumbs as Array<{ detail: string }>;
    expect(crumbs.length).toBeLessThan(MAX_BREADCRUMBS);
    expect(crumbs.at(-1)!.detail.startsWith(`${MAX_BREADCRUMBS - 1}-`)).toBe(true);
    expect((r.stack as string[]).length).toBe(10);
  });

  it('does not send without an endpoint, and swallows transport failures', () => {
    initReporter({ app: 'shore', release: 'local' });
    report('api', { message: 'a', label: 'a', status: 500 });
    flushReports();
    expect(fetchMock()).not.toHaveBeenCalled();
    initReporter({ app: 'shore', release: 'local', endpoint: ENDPOINT });
    fetchMock().mockRejectedValueOnce(new TypeError('offline'));
    report('api', { message: 'b', label: 'b', status: 500 });
    expect(() => flushReports()).not.toThrow();
    fetchMock().mockImplementationOnce(() => { throw new TypeError('bad url'); });
    report('api', { message: 'c', label: 'c', status: 500 });
    expect(() => flushReports()).not.toThrow();
    vi.stubGlobal('fetch', undefined);
    report('api', { message: 'd', label: 'd', status: 500 });
    expect(() => flushReports()).not.toThrow();
  });

  it('survives a throwing context provider', () => {
    initReporter({ app: 'shore', release: 'local', endpoint: ENDPOINT, context: () => { throw new Error('ctx'); } });
    expect(() => report('api', { message: 'a', label: 'a', status: 500 })).not.toThrow();
  });

  it('reportCaught handles Error and non-Error throwables', () => {
    reportCaught('guests', new RangeError('bad row'));
    reportCaught('guests', 'string throw');
    flushReports();
    const [batch] = sentBatches();
    expect(batch[0]).toMatchObject({ kind: 'caught', name: 'RangeError', label: 'guests', message: 'bad row' });
    expect(batch[1]).toMatchObject({ kind: 'caught', label: 'guests', message: 'string throw' });
    expect(batch[1].name).toBeUndefined();
  });

  it('mints a fallback session id when crypto.randomUUID is unavailable', () => {
    vi.stubGlobal('crypto', {});
    resetReporter();
    expect(reporterSnapshot().sessionId).toMatch(/^s-/);
  });
});
