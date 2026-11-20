import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  LEAVE_GRACE_MS, MAX_BATCH, MAX_BATCH_BYTES, MAX_BREADCRUMBS, MAX_REPORTS_PER_SESSION, MAX_REPORT_BYTES,
  addBreadcrumb, fingerprintOf, flushReports, initReporter, leavePage, report, reportCaught,
  reporterSnapshot, resetReporter, routeTemplate, scrub,
} from './report';
import type { ReportContext, ReportFields } from './report';

const ENDPOINT = 'https://public-api.test.boracaya.com/telemetry/errors';

const fetchMock = () => fetch as unknown as ReturnType<typeof vi.fn>;
/** The raw JSON string handed to fetch for the n-th batch — what actually crosses the wire. */
const sentBody = (n = 0) => (fetchMock().mock.calls[n][1] as RequestInit).body as string;
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
      auth: { hasToken: true, expiresInS: 120 }, online: true, ua: 'UA', automated: false,
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
    expect(Object.keys(r).sort()).toEqual(['app', 'automated', 'breadcrumbs', 'fingerprint', 'kind', 'message', 'release', 'sessionId', 't', 'v']);
  });

  it('stamps automated from navigator.webdriver: true under Playwright, false for a person, false with no navigator', () => {
    // distinct labels: api fingerprints key on the call, and a repeat is deduped per session
    vi.stubGlobal('navigator', { webdriver: true });
    report('api', { message: 'driven', label: 'a' });
    vi.stubGlobal('navigator', { webdriver: false });
    report('api', { message: 'a person', label: 'b' });
    vi.stubGlobal('navigator', undefined);
    report('api', { message: 'no navigator at all', label: 'c' });
    vi.advanceTimersByTime(LEAVE_GRACE_MS); // status-less api reports wait out the leave grace
    flushReports();
    expect(sentBatches()[0].map((r) => [r.message, r.automated])).toEqual([
      ['driven', true], ['a person', false], ['no navigator at all', false],
    ]);
  });

  it('drops unknown keys from the fields and from the context: neither key nor value reaches the wire', () => {
    // Values are deliberately NOT scrub-shaped, so only the allowlist can keep them off the wire.
    initReporter({ app: 'valet', release: 'abc123', endpoint: ENDPOINT,
      context: () => ({ route: '/r', secretToken: 'sk-CTX-LEAK', password: 'hunter2-ctx' } as ReportContext) });
    report('api', { message: 'a', label: 'a', status: 500,
      secretToken: 'sk-FIELD-LEAK', apiKey: 'ak-FIELD-LEAK' } as ReportFields);
    flushReports();
    const body = sentBody();
    expect(JSON.parse(body).reports[0]).toMatchObject({ message: 'a', label: 'a', route: '/r' });
    for (const s of ['secretToken', 'sk-CTX-LEAK', 'sk-FIELD-LEAK', 'password', 'hunter2-ctx', 'apiKey', 'ak-FIELD-LEAK']) {
      expect(body).not.toContain(s);
    }
  });

  it('scrubs every free-text field end to end: message, name, label, url, requestId, stack, componentStack, crumbs, context', () => {
    // One email, one JWT and one bearer token per field, all distinct, so a leak names the field that leaked.
    const email = (f: string) => `${f}.owner@leak-${f}.example`;
    const jwt = (f: string) => `eyJ${f}aaaaaaaa.eyJ${f}bbbbbbbb.${f}cccccccc`;
    const bearer = (f: string) => `Bearer ${f}-bearer-secret`;
    const sentinels: string[] = [];
    const sensitive = (f: string) => {
      sentinels.push(email(f), jwt(f), `${f}-bearer-secret`);
      return `${f}: ${email(f)} ${jwt(f)} ${bearer(f)}`;
    };
    addBreadcrumb({ type: 'route', detail: sensitive('crumbRoute') });
    addBreadcrumb({ type: 'api', detail: sensitive('crumbApi'), status: 500 });
    addBreadcrumb({ type: 'click', detail: sensitive('crumbClick') });
    addBreadcrumb({ type: 'auth', detail: sensitive('crumbAuth') });
    addBreadcrumb({ type: 'note', detail: sensitive('crumbNote') });
    // The context too: a path segment, an event id and the UA string are text a
    // proxy, a deep link or an extension can put an address or a token into.
    resetReporter();
    initReporter({ app: 'valet', release: 'abc123', endpoint: ENDPOINT,
      context: () => ({ route: `/events/${sensitive('route')}/rsvp`, eventId: sensitive('eventId'),
        ua: sensitive('ua'), online: true }) });
    addBreadcrumb({ type: 'note', detail: sensitive('crumbNote2') });
    report('render', {
      message: sensitive('message'),
      name: sensitive('name'),
      label: sensitive('label'),
      // A URL carries no literal `Bearer …` (the space would be %20-encoded), so
      // its sentinels are the two shapes a path can hold: an address, a JWT.
      url: `https://valet.test.boracaya.com/guests/${email('url')}/${jwt('url')}/edit`,
      requestId: sensitive('requestId'),
      stack: [sensitive('stack0'), `at f (${sensitive('stack1')}:1:1)`, `at g (${sensitive('stack2')}:2:2)`].join('\n'),
      componentStack: sensitive('componentStack'),
    });
    flushReports();
    const body = sentBody();
    const r = JSON.parse(body).reports[0];
    // Every field is still on the wire (redacted, not dropped) ...
    expect(r.message).toContain('[email]');
    expect(r.name).toContain('[token]');
    expect(r.label).toContain('[email]');
    expect(r.routeTemplate).toContain('[email]');
    expect(r.requestId).toContain('[token]');
    expect(r.stack).toHaveLength(3);
    expect(r.componentStack).toContain('[token]');
    expect(r.route).toContain('[email]');
    expect(r.eventId).toContain('[token]');
    expect(r.ua).toContain('[email]');
    expect(r.breadcrumbs).toHaveLength(1);
    // ... and none of the sentinels (17 fields x email/JWT/bearer, + the URL's two) survives in the raw request body.
    sentinels.push(email('url'), jwt('url'));
    expect(sentinels).toHaveLength(53);
    for (const s of sentinels) expect(body).not.toContain(s);
  });

  describe('a transport failure waits out the leave grace (cdk#1494 inbox: navigation-cancelled fetches)', () => {
    const transport = (label: string) => report('api', { message: `${label}: network error (Load failed)`,
      name: 'ApiError', label, method: 'GET', url: '/discover' });

    it('is held, not queued, and the timer sends it once the grace has passed', () => {
      transport('discover');
      expect(reporterSnapshot()).toMatchObject({ queued: 0, held: 1, accepted: 1 });
      flushReports(); // inside the grace: still held, nothing on the wire
      expect(fetchMock()).not.toHaveBeenCalled();
      expect(reporterSnapshot().held).toBe(1);
      vi.advanceTimersByTime(1_500); // the literal grace (LEAVE_GRACE_MS), pinned
      expect(sentBatches().flat().map((r) => r.label)).toEqual(['discover']);
      expect(reporterSnapshot()).toMatchObject({ queued: 0, held: 0 });
    });

    it('leaving the page inside the grace drops it, un-sees it, and sends everything else', () => {
      report('api', { message: 'invites: HTTP 500', label: 'invites', method: 'GET', url: '/invites', status: 500 });
      transport('discover');
      vi.advanceTimersByTime(LEAVE_GRACE_MS - 1);
      leavePage();
      expect(sentBatches().flat().map((r) => r.label)).toEqual(['invites']);
      expect(reporterSnapshot()).toMatchObject({ queued: 0, held: 0, accepted: 1 });
      // the same fingerprint later in this session is a real failure again (sent by the regular flush timer)
      transport('discover');
      vi.advanceTimersByTime(5_000);
      expect(sentBatches().flat().map((r) => r.label)).toEqual(['invites', 'discover']);
    });

    it('a transport failure that outlived the grace before the page is left is sent by leavePage', () => {
      transport('discover');
      vi.advanceTimersByTime(LEAVE_GRACE_MS);
      leavePage();
      expect(sentBatches().flat().map((r) => r.label)).toEqual(['discover']);
    });

    it('a failure with a status is never held', () => {
      report('api', { message: 'rsvp: HTTP 503', label: 'rsvp', method: 'GET', url: '/rsvp', status: 503 });
      expect(reporterSnapshot()).toMatchObject({ queued: 1, held: 0 });
      leavePage();
      expect(sentBatches().flat().map((r) => r.label)).toEqual(['rsvp']);
    });
  });

  it('dedupes a fingerprint within the session', () => {
    for (let i = 0; i < 3; i += 1) report('api', { message: `m${i}`, label: 'x', method: 'GET', url: '/a', status: 500 });
    expect(reporterSnapshot().queued).toBe(1);
  });

  // The three operational limits below are pinned as LITERALS, not via the exported constants:
  // the contract is 20 reports per page load, 10 per batch, 5 s to flush (cdk#1495).
  it('accepts exactly 20 reports per page load: the 21st distinct fingerprint is dropped', () => {
    for (let i = 1; i <= 21; i += 1) report('api', { message: 'm', label: `l${i}`, method: 'GET', url: '/a', status: 500 });
    flushReports();
    const labels = sentBatches().flat().map((r) => r.label);
    expect(labels).toHaveLength(20);
    expect(labels[0]).toBe('l1');
    expect(labels[19]).toBe('l20');
    expect(labels).not.toContain('l21');
  });

  it('flushes a batch at exactly 10 reports: 9 wait, the 10th sends', () => {
    for (let i = 1; i <= 9; i += 1) report('api', { message: 'b', label: `b${i}`, status: 500 });
    expect(fetchMock()).not.toHaveBeenCalled();
    report('api', { message: 'b', label: 'b10', status: 500 });
    expect(fetchMock()).toHaveBeenCalledTimes(1);
    expect(sentBatches()[0]).toHaveLength(10);
  });

  it('flushes a lone report after exactly 5000 ms: nothing at 4999 ms, sent at 5000 ms', () => {
    report('api', { message: 'a', label: 'a', status: 500 });
    vi.advanceTimersByTime(4999);
    expect(fetchMock()).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(fetchMock()).toHaveBeenCalledTimes(1);
    expect(sentBatches()[0]).toHaveLength(1);
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

  it('drops a cancelled outcome and keeps the real one (#167)', () => {
    // cdk#1510 / cdk#1539: the nightly triage auto-filed the same cancelled
    // read twice. A cancellation is not an outcome, so it never becomes a
    // report — through the swallow funnel...
    reportCaught('event config', new DOMException('The user aborted a request.', 'AbortError'));
    // ...nor through the window handlers, where a cancelled promise arrives
    // with no call site left to guard it.
    report('rejection', { message: 'The user aborted a request.', name: 'AbortError' });
    report('uncaught', { message: 'signal is aborted without reason', name: 'AbortError' });
    // ...nor when it carries the `cancelled` flag rather than the AbortError
    // name, which is the shape a CancelledError keeps if a consumer renames it.
    reportCaught('event config', Object.assign(new Error('cancelled'), { cancelled: true }));
    flushReports();
    expect(sentBatches()).toEqual([]);

    // A real network error still reports, so the drop is a classification and
    // not a hole.
    reportCaught('event config', new TypeError('Load failed'));
    flushReports();
    const [batch] = sentBatches();
    expect(batch).toHaveLength(1);
    expect(batch[0]).toMatchObject({ kind: 'caught', name: 'TypeError', message: 'Load failed' });
  });

  it('mints a fallback session id when crypto.randomUUID is unavailable', () => {
    vi.stubGlobal('crypto', {});
    resetReporter();
    expect(reporterSnapshot().sessionId).toMatch(/^s-/);
  });
});

// cdk#2661: the ingest (boracaya-cdk lambdas/pda-boracay-telemetry MAX_BODY_BYTES)
// refuses a body over 32 KiB whole with a 413, and the reporter never retries.
// Ten ordinary stack-bearing reports came to 34,093 bytes in one POST, so the
// whole burst was lost. A flush now splits by UTF-8 bytes as well as by count.
describe('batch byte bound (cdk#2661)', () => {
  const INGEST_MAX_BODY_BYTES = 32 * 1024; // boracaya-cdk lambda_function.py MAX_BODY_BYTES
  const utf8 = (s: string) => new TextEncoder().encode(s).length;
  const bodies = () => fetchMock().mock.calls.map((c) => (c[1] as RequestInit).body as string);
  const EVENT = '2f853dbf-1111-4222-8333-944455556666';

  beforeEach(() => {
    resetReporter();
    initReporter({
      app: 'valet', release: 'f804d211ff8394d6ec0b263afe312799bec0415c', endpoint: ENDPOINT,
      context: () => ({ route: `/events/${EVENT}/photos`, eventId: EVENT, auth: { hasToken: true, expiresInS: 3000 },
        online: true,
        ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36' }),
    });
  });

  /** The audit's burst: a full crumb ring, then ten caught reports with ordinary 10-frame stacks. */
  const burst = (sites: number, frameText = (site: number, f: number) =>
    `    at view${site}_${f} (https://valet.test.boracaya.com/assets/SwitchboardShell-B3k9Qx2a.js:${1000 + f}:${20000 + f * 7})`) => {
    for (let i = 0; i < 20; i += 1) {
      if (i % 2) addBreadcrumb({ type: 'route', detail: `/events/${EVENT}/${['photos', 'rsvp', 'guests', 'website', 'pulse'][i % 5]}` });
      else addBreadcrumb({ type: 'api', detail: `GET /events/{id}/${['moments', 'rsvp', 'roster', 'about', 'pulse-config'][i % 5]}`, status: 200 });
    }
    for (let site = 0; site < sites; site += 1) {
      const message = `Cannot read properties of undefined (reading 'map') while building the ${site} view model`;
      const stack = [`TypeError: ${message}`, ...Array.from({ length: 9 }, (_, f) => frameText(site, f))].join('\n');
      report('caught', { message, name: 'TypeError', label: `Could not load screen ${site}. Please try again.`, stack });
    }
  };

  it('MAX_BATCH_BYTES sits below the ingest cap (30 KiB < 32 KiB)', () => {
    expect(MAX_BATCH_BYTES).toBe(30 * 1024);
    expect(MAX_BATCH_BYTES).toBeLessThan(INGEST_MAX_BODY_BYTES);
    // One report at the per-report cap always fits a body on its own.
    expect(MAX_REPORT_BYTES + '{"reports":[]}'.length).toBeLessThanOrEqual(MAX_BATCH_BYTES);
  });

  it('the audit burst of ten caught reports goes out as two or more bodies, each within the cap, none lost', () => {
    burst(10);
    flushReports();
    const sent = bodies();
    expect(sent.length).toBeGreaterThanOrEqual(2);
    for (const body of sent) expect(utf8(body)).toBeLessThanOrEqual(MAX_BATCH_BYTES);
    const labels = sentBatches().flat().map((r) => r.label);
    expect(labels).toEqual(Array.from({ length: 10 }, (_, s) => `Could not load screen ${s}. Please try again.`));
  });

  it('measures UTF-8 bytes, not UTF-16 length: a non-Latin burst is split by its encoded size', () => {
    // Each frame character is three bytes in UTF-8 but one UTF-16 unit.
    burst(MAX_BATCH, (site, f) => `    at ビュー${site}_${f} (${'表示'.repeat(60)}.js:1:1)`);
    flushReports();
    const sent = bodies();
    for (const body of sent) expect(utf8(body)).toBeLessThanOrEqual(MAX_BATCH_BYTES);
    expect(sentBatches().flat()).toHaveLength(MAX_BATCH);
    // The bound bit: the whole burst would not have fit one body by its UTF-8 size.
    const whole = JSON.stringify({ reports: sentBatches().flat() });
    expect(utf8(whole)).toBeGreaterThan(MAX_BATCH_BYTES);
  });

  it('every report of a full session, each at its byte cap, is delivered within the cap', () => {
    for (let i = 0; i < MAX_BREADCRUMBS; i += 1) addBreadcrumb({ type: 'note', detail: `${i}-${'é'.repeat(115)}` });
    for (let i = 0; i < MAX_REPORTS_PER_SESSION; i += 1) {
      const stack = Array.from({ length: 10 }, (_, f) => `at f${i}_${f} (${'ü'.repeat(450)}:1:1)`).join('\n');
      report('render', { message: `big ${i}`, label: `l${i}`, stack, componentStack: 'ç'.repeat(600) });
    }
    flushReports();
    const delivered = sentBatches().flat();
    expect(delivered).toHaveLength(MAX_REPORTS_PER_SESSION);
    for (const r of delivered) expect(utf8(JSON.stringify(r))).toBeLessThanOrEqual(MAX_REPORT_BYTES);
    for (const body of bodies()) expect(utf8(body)).toBeLessThanOrEqual(MAX_BATCH_BYTES);
    for (const batch of sentBatches()) expect(batch.length).toBeLessThanOrEqual(MAX_BATCH);
  });

  it('the per-report cap is UTF-8 bytes: non-ASCII crumbs are trimmed to fit it', () => {
    for (let i = 0; i < MAX_BREADCRUMBS; i += 1) addBreadcrumb({ type: 'note', detail: `${i}-${'界'.repeat(115)}` });
    report('caught', { message: 'one', label: 'x' });
    flushReports();
    const [r] = sentBatches()[0];
    expect(utf8(JSON.stringify(r))).toBeLessThanOrEqual(MAX_REPORT_BYTES);
    // UTF-16 length alone would have kept every crumb (20 x ~125 units is under 8 KiB).
    expect((r.breadcrumbs as unknown[]).length).toBeLessThan(MAX_BREADCRUMBS);
  });

  it('a report whose frames alone pass the cap loses trailing frames, keeping the first', () => {
    const stack = Array.from({ length: 10 }, (_, f) => `at f${f} (${'界'.repeat(480)}:1:1)`).join('\n');
    report('render', { message: 'huge', stack, componentStack: '界'.repeat(600) });
    flushReports();
    const [r] = sentBatches()[0];
    expect(utf8(JSON.stringify(r))).toBeLessThanOrEqual(MAX_REPORT_BYTES);
    expect((r.stack as string[])[0].startsWith('at f0 ')).toBe(true);
  });

  it('when one frame is all that is left, the component stack goes before the cap is passed', () => {
    const wide = '界'.repeat(500);
    // About 8.8 KB with the component stack, about 7.3 KB without it.
    report('render', { message: wide, name: wide, requestId: wide, label: '界'.repeat(250),
      stack: `at f0 (${'界'.repeat(490)}:1:1)
at f1 (x.js:1:1)`, componentStack: wide });
    flushReports();
    const [r] = sentBatches()[0];
    expect(utf8(JSON.stringify(r))).toBeLessThanOrEqual(MAX_REPORT_BYTES);
    expect(r.componentStack).toBeUndefined();
    expect((r.stack as string[])).toHaveLength(1);
    expect(r.message).toBe(wide);
  });

  it('more than MAX_BATCH small reports in one flush go out MAX_BATCH to a body, in order', () => {
    // Three transport failures wait out their grace while nine reports queue (no
    // count-triggered flush below ten); the flush then sends all twelve.
    for (let i = 1; i <= 3; i += 1) report('api', { message: 'net', label: `t${i}`, method: 'GET', url: `https://x.test/t${i}` });
    vi.setSystemTime(Date.now() + LEAVE_GRACE_MS + 1);
    for (let i = 1; i <= 9; i += 1) report('api', { message: 'b', label: `b${i}`, status: 500 });
    expect(fetchMock()).not.toHaveBeenCalled();
    flushReports();
    const sent = sentBatches().map((b) => b.map((r) => r.label));
    expect(sent.map((b) => b.length)).toEqual([MAX_BATCH, 2]);
    expect(sent.flat()).toEqual([...Array.from({ length: 9 }, (_, i) => `b${i + 1}`), 't1', 't2', 't3']);
  });

  it('small batches are not split: count and order hold as before', () => {
    for (let i = 1; i <= 3; i += 1) report('api', { message: 'b', label: `b${i}`, status: 500 });
    flushReports();
    expect(sentBatches().map((b) => b.map((r) => r.label))).toEqual([['b1', 'b2', 'b3']]);
  });
});
