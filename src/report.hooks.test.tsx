// @vitest-environment jsdom
import React from 'react';
import { render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, getJson, jsonOr, runGuarded, sendJson } from './data';
import { createCachedLoad, resetCache } from './cache';
import { ErrorBoundary } from './ErrorBoundary';
import { onDocumentClick, onUncaughtErrors, pageTelemetryContext } from './browser';
import { flushReports, initReporter, reporterSnapshot, resetReporter } from './report';
import { idTokenExpiresInSeconds, setIdToken, clearIdToken } from './authToken';
import { guestTokenExpiresInSeconds } from './guestAuth';

const ENDPOINT = 'https://public-api.test.boracaya.com/telemetry/errors';
const API = 'https://valet-api.test.boracaya.com/events/2f853dbf-82b2-4780-8a5a-8bc4029dd1f5/invites';

const fetchMock = () => fetch as unknown as ReturnType<typeof vi.fn>;
/** The reports on the wire: every fetch to the telemetry endpoint, flattened. */
const wire = () => {
  flushReports();
  return fetchMock().mock.calls
    .filter((c) => c[0] === ENDPOINT)
    .flatMap((c) => JSON.parse((c[1] as RequestInit).body as string).reports as Array<Record<string, unknown>>);
};
const jsonResponse = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 204 })));
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  resetReporter();
  resetCache();
  initReporter({ app: 'valet', release: 'r1', endpoint: ENDPOINT });
});

afterEach(() => {
  resetReporter();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('data.ts reports its failures once, with the backend request id', () => {
  it('getJson: HTTP failure carries status, label, route template and x-amzn-RequestId', async () => {
    fetchMock().mockResolvedValueOnce(jsonResponse({}, 401, { 'x-amzn-RequestId': 'req-401' }));
    await expect(getJson(API, { label: 'invites' })).rejects.toBeInstanceOf(ApiError);
    const [r] = wire();
    expect(r).toMatchObject({ kind: 'api', label: 'invites', method: 'GET', status: 401,
      routeTemplate: '/events/{id}/invites', requestId: 'req-401' });
    expect(typeof r.durationMs).toBe('number');
    expect(r.breadcrumbs).toEqual([expect.objectContaining({ type: 'api', detail: 'GET /events/{id}/invites', status: 401 })]);
  });

  it('getJson: network failure reports without status; an aborted call does not', async () => {
    fetchMock().mockRejectedValueOnce(new TypeError('offline'));
    await expect(getJson(API, { label: 'invites' })).rejects.toBeInstanceOf(ApiError);
    const ctl = new AbortController();
    ctl.abort();
    fetchMock().mockRejectedValueOnce(new DOMException('aborted', 'AbortError'));
    await expect(getJson(API, { label: 'invites', signal: ctl.signal })).rejects.toBeInstanceOf(ApiError);
    const reports = wire();
    expect(reports).toHaveLength(1);
    expect(reports[0].status).toBeUndefined();
  });

  it('getJson: body-read and JSON-parse failures report; a success leaves only a crumb', async () => {
    const res = new Response('x', { status: 200 });
    vi.spyOn(res, 'text').mockRejectedValue(new TypeError('reset'));
    fetchMock().mockResolvedValueOnce(res);
    await expect(getJson(API, { label: 'a' })).rejects.toBeInstanceOf(ApiError);
    fetchMock().mockResolvedValueOnce(new Response('<html>', { status: 200 }));
    await expect(getJson(API, { label: 'b' })).rejects.toBeInstanceOf(ApiError);
    fetchMock().mockResolvedValueOnce(jsonResponse({ ok: true }));
    await expect(getJson(API, { label: 'c' })).resolves.toEqual({ ok: true });
    const reports = wire();
    expect(reports.map((r) => r.label)).toEqual(['a', 'b']);
    // one crumb per call, failure or success — never a success crumb AND a failure crumb
    expect(reporterSnapshot().breadcrumbs.map((c) => c.status)).toEqual([200, 200, 200]);
  });

  it('sendJson: server error, network error, abort, body failure, bad JSON, success', async () => {
    fetchMock().mockResolvedValueOnce(jsonResponse({ error: 'dup' }, 409, { 'x-amzn-RequestId': 'req-409' }));
    await expect(sendJson(API, { method: 'PUT', body: {}, label: 'save' })).rejects.toMatchObject({ message: 'dup' });
    fetchMock().mockRejectedValueOnce(new TypeError('offline'));
    await expect(sendJson(API, { method: 'POST', label: 'net' })).rejects.toBeInstanceOf(ApiError);
    const ctl = new AbortController();
    ctl.abort();
    fetchMock().mockRejectedValueOnce(new DOMException('aborted', 'AbortError'));
    await expect(sendJson(API, { method: 'POST', label: 'abort', signal: ctl.signal })).rejects.toBeInstanceOf(ApiError);
    const res = new Response('x', { status: 200 });
    vi.spyOn(res, 'text').mockRejectedValue(new TypeError('reset'));
    fetchMock().mockResolvedValueOnce(res);
    await expect(sendJson(API, { method: 'POST', label: 'body' })).rejects.toBeInstanceOf(ApiError);
    fetchMock().mockResolvedValueOnce(new Response('<html>', { status: 200 }));
    await expect(sendJson(API, { method: 'POST', label: 'json' })).rejects.toBeInstanceOf(ApiError);
    fetchMock().mockResolvedValueOnce(jsonResponse({ ok: 1 }, 201));
    await expect(sendJson(API, { method: 'POST', label: 'ok' })).resolves.toEqual({ ok: 1 });
    const reports = wire();
    expect(reports.map((r) => r.label)).toEqual(['save', 'net', 'body', 'json']);
    expect(reports[0]).toMatchObject({ method: 'PUT', status: 409, requestId: 'req-409' });
    expect(reporterSnapshot().breadcrumbs.at(-1)).toMatchObject({ type: 'api', status: 201 });
  });

  it('a response whose headers lack get() (a bare mock) reports without a request id', async () => {
    fetchMock().mockResolvedValueOnce({ ok: false, status: 500, headers: {}, text: async () => '' } as unknown as Response);
    await expect(getJson(API, { label: 'bare' })).rejects.toBeInstanceOf(ApiError);
    expect(wire()[0].requestId).toBeUndefined();
  });

  it('jsonOr and runGuarded report a swallowed non-ApiError, never a second ApiError', async () => {
    fetchMock().mockResolvedValueOnce(jsonResponse({}, 503));
    await expect(jsonOr(API, 'list', [])).resolves.toEqual([]);
    const boom = async () => { throw new RangeError('transform'); };
    const set = vi.fn();
    await runGuarded(boom, set, 'load failed');
    await runGuarded(async () => { throw new ApiError('x', 'x: HTTP 500', 500); }, set, 'load failed');
    const reports = wire();
    expect(reports.map((r) => [r.kind, r.label])).toEqual([['api', 'list'], ['caught', 'load failed']]);
    expect(reports[1]).toMatchObject({ name: 'RangeError', message: 'transform' });
  });
});

describe('cache.ts reports a swallowed non-ApiError on both failure paths', () => {
  it('cold-miss failure and stale revalidation failure', async () => {
    const set = vi.fn();
    let calls = 0;
    const handle = createCachedLoad<number>({
      key: 'evt/guests', ttlMs: 0,
      load: async () => { calls += 1; if (calls === 1) return 1; throw new TypeError(`shape ${calls}`); },
      set, errorMessage: 'guests failed',
    });
    handle.run();
    await vi.waitFor(() => expect(set).toHaveBeenCalledWith({ data: 1, isLoading: false, error: null }));
    handle.run(); // ttl 0 => stale hit + background revalidation, which throws
    await vi.waitFor(() => expect(calls).toBe(2));
    await new Promise((r) => setTimeout(r, 0));
    handle.dispose();
    const cold = createCachedLoad<number>({
      key: 'evt/other', ttlMs: 0,
      load: async () => { throw new TypeError('cold'); },
      set, errorMessage: 'other failed',
    });
    cold.run();
    await vi.waitFor(() => expect(set).toHaveBeenCalledWith({ data: null, isLoading: false, error: 'other failed' }));
    cold.dispose();
    const reports = wire();
    expect(reports.map((r) => [r.kind, r.label, r.message])).toEqual([
      ['caught', 'evt/guests', 'shape 2'],
      ['caught', 'other failed', 'cold'],
    ]);
  });
});

describe('ErrorBoundary reports the render throw with its component stack', () => {
  it('kind render, name, label, stack, componentStack', () => {
    const Thrower = () => { throw new TypeError('render boom'); };
    render(
      <ErrorBoundary label="valet" fallback={<p>fallback</p>}>
        <Thrower />
      </ErrorBoundary>,
    );
    const [r] = wire();
    expect(r).toMatchObject({ kind: 'render', name: 'TypeError', label: 'valet', message: 'render boom' });
    expect((r.stack as string[])[0]).toContain('TypeError: render boom');
    expect(typeof r.componentStack).toBe('string');
  });

  it('defaults the label to app', () => {
    const Thrower = () => { throw new Error('x'); };
    render(<ErrorBoundary fallback={<p>f</p>}><Thrower /></ErrorBoundary>);
    expect(wire()[0].label).toBe('app');
  });
});

describe('browser.ts telemetry adapters', () => {
  it('onUncaughtErrors wires error / unhandledrejection / pagehide and unsubscribes', () => {
    const h = { onError: vi.fn(), onRejection: vi.fn(), onPageHide: vi.fn() };
    const off = onUncaughtErrors(h);
    window.dispatchEvent(new ErrorEvent('error', { message: 'm', error: new Error('e') }));
    window.dispatchEvent(new Event('unhandledrejection'));
    window.dispatchEvent(new Event('pagehide'));
    expect(h.onError).toHaveBeenCalledWith('m', expect.any(Error));
    expect(h.onRejection).toHaveBeenCalledTimes(1);
    expect(h.onPageHide).toHaveBeenCalledTimes(1);
    off();
    window.dispatchEvent(new Event('pagehide'));
    expect(h.onPageHide).toHaveBeenCalledTimes(1);
  });

  it('onDocumentClick reports a stable identifier, never the accessible name', () => {
    document.body.innerHTML = `
      <button aria-label="Open Alex &amp; Sam"><span id="inner">Alex &amp; Sam</span></button>
      <a data-testid="event-card" aria-label="Alex &amp; Alexa"><b id="link">Alex &amp; Alexa</b></a>
      <input type="email" id="email" value="alex@example.com" aria-label="Alex's email" />
      <div id="plain">nothing</div>
      <div role="tab" id="tab" aria-label="Attend as Alex">Attend</div>`;
    const names: string[] = [];
    const off = onDocumentClick((n) => names.push(n));
    document.getElementById('inner')!.click();
    document.getElementById('link')!.click();
    document.getElementById('email')!.click();
    document.getElementById('plain')!.click();
    document.getElementById('tab')!.click();
    off();
    document.getElementById('inner')!.click();
    expect(names).toEqual(['button', 'event-card', 'input:email', 'div[role=tab]']);
    // Neither the label, the text, nor the value of any control reaches the crumb.
    expect(names.join(' ')).not.toMatch(/Alex|Sam|example\.com|Attend/);
  });

  it('pageTelemetryContext reads route, connectivity and UA', () => {
    const ctx = pageTelemetryContext();
    expect(ctx.route).toBe(window.location.pathname);
    expect(typeof ctx.online).toBe('boolean');
    expect(typeof ctx.ua).toBe('string');
  });
});

describe('token expiry readers expose seconds, never the token', () => {
  const jwt = (exp: number) => `h.${btoa(JSON.stringify({ exp })).replace(/=+$/, '')}.s`;

  it('idTokenExpiresInSeconds', () => {
    clearIdToken();
    expect(idTokenExpiresInSeconds()).toBeUndefined();
    setIdToken(jwt(Math.floor(Date.now() / 1000) + 3600));
    const s = idTokenExpiresInSeconds()!;
    expect(s).toBeGreaterThan(3500);
    expect(s).toBeLessThanOrEqual(3600);
    setIdToken('h.!!!.s');
    expect(idTokenExpiresInSeconds()).toBeUndefined();
    clearIdToken();
  });

  it('guestTokenExpiresInSeconds', () => {
    sessionStorage.removeItem('pdab_guest_token');
    expect(guestTokenExpiresInSeconds()).toBeUndefined();
    sessionStorage.setItem('pdab_guest_token', JSON.stringify({ token: 't', exp: Math.floor(Date.now() / 1000) + 60, userId: 'u', eventId: 'e' }));
    const s = guestTokenExpiresInSeconds()!;
    expect(s).toBeGreaterThan(50);
    expect(s).toBeLessThanOrEqual(60);
    sessionStorage.setItem('pdab_guest_token', JSON.stringify({ token: 't' }));
    expect(guestTokenExpiresInSeconds()).toBeUndefined();
    sessionStorage.removeItem('pdab_guest_token');
  });
});
