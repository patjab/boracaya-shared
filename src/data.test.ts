import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ApiError, CancelledError, asArray, clean, getJson, isCancelled, jsonOr, runGuarded, sendJson,
  GuardedState,
} from './data';
import { observeApiCalls } from './apiObserver';

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn());
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const fetchMock = () => fetch as unknown as ReturnType<typeof vi.fn>;

describe('getJson', () => {
  it('parses a 200 JSON body', async () => {
    fetchMock().mockResolvedValue(jsonResponse({ ok: true }));
    await expect(getJson('https://x/y')).resolves.toEqual({ ok: true });
  });

  it('maps non-2xx to a labeled ApiError with status', async () => {
    fetchMock().mockResolvedValue(jsonResponse({}, 503));
    const err = await getJson('https://x/y', { label: 'invites' }).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.label).toBe('invites');
    expect(err.status).toBe(503);
  });

  it('maps network failures to ApiError without status', async () => {
    fetchMock().mockRejectedValue(new TypeError('offline'));
    const err = await getJson('https://x/y', { label: 'rsvps' }).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBeUndefined();
    expect(err.message).toContain('offline');
  });

  it('maps a non-JSON body to ApiError', async () => {
    fetchMock().mockResolvedValue(new Response('<html>', { status: 200 }));
    await expect(getJson('https://x/y')).rejects.toBeInstanceOf(ApiError);
  });

  it('resolves undefined for a successful empty response (204 / empty 200)', async () => {
    fetchMock().mockResolvedValue(new Response(null, { status: 204 }));
    await expect(getJson('https://x/y')).resolves.toBeUndefined();
    fetchMock().mockResolvedValue(new Response('', { status: 200 }));
    await expect(getJson('https://x/y')).resolves.toBeUndefined();
    fetchMock().mockResolvedValue(new Response(' \n ', { status: 200 }));
    await expect(getJson('https://x/y')).resolves.toBeUndefined();
  });

  it('maps a body-stream read failure to ApiError instead of a fake empty body', async () => {
    const res = new Response('x', { status: 200 });
    vi.spyOn(res, 'text').mockRejectedValue(new TypeError('connection reset'));
    fetchMock().mockResolvedValue(res);
    const err = await getJson('https://x/y', { label: 'invites' }).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.message).toContain('connection reset');
  });

  it('a declared status (expect) still throws the typed ApiError — the call site classifies it', async () => {
    fetchMock().mockResolvedValue(jsonResponse(null, 404));
    const err = await getJson('https://x/y', { label: 'rsvp-view', expect: [404] }).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(404);
  });

  it('an AbortError without a signal is a CancelledError, not a network error (#167)', async () => {
    fetchMock().mockRejectedValue(new DOMException('Fetch is aborted', 'AbortError'));
    const err = await getJson('https://x/y', { label: 'rsvps' }).catch((e) => e);
    // Still an ApiError, so every existing catch keeps working.
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toBeInstanceOf(CancelledError);
    expect(err.status).toBeUndefined();
    expect(isCancelled(err)).toBe(true);
    // The identity used to be lost inside the message. It no longer is, and
    // the browser's own wording no longer reaches a host's screen.
    expect(err.name).toBe('AbortError');
    expect(err.message).not.toContain('network error');
    expect(err.message).not.toContain('aborted');

    // The flag is a promised part of the contract, not decoration, and it
    // needs its own assertion: `isCancelled` answers through the NAME, so
    // deleting `cancelled = true` left every other test here passing
    // (Codex r2 on #169).
    expect(err.cancelled).toBe(true);
    // And the flag is what the contract rests on when the name is not: a
    // consumer that renames the error must still be recognizable.
    err.name = 'ApiError';
    expect(isCancelled(err)).toBe(true);
  });

  it("a call whose own signal aborted is cancelled whatever the engine rejected with", async () => {
    const controller = new AbortController();
    controller.abort();
    // Some engines reject an aborted fetch with a plain TypeError rather than
    // an AbortError; the caller's own signal settles it either way.
    fetchMock().mockRejectedValue(new TypeError('Load failed'));
    const err = await getJson('https://x/y', { label: 'rsvps', signal: controller.signal }).catch((e) => e);
    expect(isCancelled(err)).toBe(true);
  });

  it('a rejected fetch WITHOUT an abort is not cancelled', async () => {
    fetchMock().mockRejectedValue(new TypeError('offline'));
    const err = await getJson('https://x/y', { label: 'rsvps' }).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).not.toBeInstanceOf(CancelledError);
    expect(isCancelled(err)).toBe(false);
    expect(err.message).toContain('offline');
  });

  it('an abort mid-BODY is cancelled, and carries no status (#167)', async () => {
    // The shape behind cdk#1510/#1539: the response arrived 200, the read was
    // cancelled, and the old code threw "failed to read the response body"
    // with that 200 attached — a success status on a failure the triage filed.
    const res = new Response('x', { status: 200 });
    vi.spyOn(res, 'text').mockRejectedValue(new DOMException('The user aborted a request.', 'AbortError'));
    fetchMock().mockResolvedValue(res);
    const err = await getJson('https://x/y', { label: 'event config' }).catch((e) => e);
    expect(isCancelled(err)).toBe(true);
    expect(err.status).toBeUndefined();
  });

  it('a cancelled call is not observed as a failure; a real one is', async () => {
    const failures: string[] = [];
    observeApiCalls({
      failure: (f) => { failures.push(f.label); },
      success: () => undefined,
      caught: () => undefined,
    });
    try {
      fetchMock().mockRejectedValue(new DOMException('Fetch is aborted', 'AbortError'));
      await getJson('https://x/y', { label: 'cancelled-read' }).catch(() => undefined);
      expect(failures).toEqual([]);

      fetchMock().mockRejectedValue(new TypeError('offline'));
      await getJson('https://x/y', { label: 'real-read' }).catch(() => undefined);
      expect(failures).toEqual(['real-read']);
    } finally {
      observeApiCalls(null);
    }
  });

  it('passes an AbortSignal through to fetch (the #159 abort seam)', async () => {
    fetchMock().mockResolvedValue(jsonResponse({}));
    const controller = new AbortController();
    await getJson('https://x/y', { signal: controller.signal });
    const [, init] = fetchMock().mock.calls[0];
    expect(init.signal).toBe(controller.signal);
  });

  it('jsonOr returns the fallback when the body is empty', async () => {
    fetchMock().mockResolvedValue(new Response('', { status: 200 }));
    await expect(jsonOr('https://x/y', 'nums', [7])).resolves.toEqual([7]);
  });
});

describe('jsonOr', () => {
  it('returns the body on success', async () => {
    fetchMock().mockResolvedValue(jsonResponse([1, 2]));
    await expect(jsonOr('https://x/y', 'nums', [])).resolves.toEqual([1, 2]);
  });

  it('returns the fallback (and never throws) on failure', async () => {
    fetchMock().mockResolvedValue(jsonResponse({}, 500));
    await expect(jsonOr('https://x/y', 'nums', [9])).resolves.toEqual([9]);
  });

  it('a cancelled read returns the fallback WITHOUT logging (#167)', async () => {
    fetchMock().mockRejectedValue(new DOMException('Fetch is aborted', 'AbortError'));
    await expect(jsonOr('https://x/y', 'nums', [9])).resolves.toEqual([9]);
    // Leaving a screen mid-read leaves no console error. A real failure still does.
    expect(console.error).not.toHaveBeenCalled();
    fetchMock().mockRejectedValue(new TypeError('offline'));
    await expect(jsonOr('https://x/y', 'nums', [9])).resolves.toEqual([9]);
    expect(console.error).toHaveBeenCalled();
  });
});

describe('sendJson', () => {
  it('serializes the body and returns parsed JSON', async () => {
    fetchMock().mockResolvedValue(jsonResponse({ id: 'a' }));
    const out = await sendJson<{ id: string }>('https://x/y', { method: 'POST', body: { n: 1 } });
    expect(out).toEqual({ id: 'a' });
    const [, init] = fetchMock().mock.calls[0];
    expect(init.method).toBe('POST');
    expect(init.body).toBe(JSON.stringify({ n: 1 }));
    expect(init.headers['Content-Type']).toBe('application/json');
  });

  it('returns undefined for an empty response body', async () => {
    fetchMock().mockResolvedValue(new Response('', { status: 200 }));
    await expect(sendJson('https://x/y', { method: 'PATCH', body: {} })).resolves.toBeUndefined();
  });

  it('passes an AbortSignal through to fetch (the #159 abort seam)', async () => {
    fetchMock().mockResolvedValue(jsonResponse({}));
    const controller = new AbortController();
    await sendJson('https://x/y', { method: 'POST', body: {}, signal: controller.signal });
    const [, init] = fetchMock().mock.calls[0];
    expect(init.signal).toBe(controller.signal);
  });

  it('an aborted write rejects as cancelled, not as a network error (#167)', async () => {
    fetchMock().mockRejectedValue(new DOMException('Fetch is aborted', 'AbortError'));
    const err = await sendJson('https://x/y', { method: 'POST', body: {}, label: 'save template' })
      .catch((e) => e);
    expect(err).toBeInstanceOf(CancelledError);
    expect(isCancelled(err)).toBe(true);
    expect(err.message).not.toContain('network error');
  });

  it("prefers the server's own error message on non-2xx", async () => {
    fetchMock().mockResolvedValue(jsonResponse({ error: 'A template with that name already exists.' }, 409));
    const err = await sendJson('https://x/y', { method: 'PUT', body: {}, label: 'create' }).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(409);
    expect(err.message).toBe('A template with that name already exists.');
  });

  it('exposes stable retry timing from a throttled response', async () => {
    fetchMock().mockResolvedValue(new Response(JSON.stringify({
      code: 'RATE_LIMITED',
      error: 'Please wait.',
      retryAfterSeconds: 90,
    }), { status: 429, headers: { 'Retry-After': '75' } }));
    const err = await sendJson('https://x/y', {
      method: 'POST', body: {}, label: 'upload',
    }).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(429);
    expect(err.retryAfterSeconds).toBe(75);
  });

  it('preserves the server error when a fetch adapter omits response headers', async () => {
    fetchMock().mockResolvedValue({
      ok: false,
      status: 403,
      text: async () => JSON.stringify({ error: 'RSVP first.' }),
    });
    const err = await sendJson('https://x/y', {
      method: 'POST', body: {}, label: 'stage',
    }).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(403);
    expect(err.message).toBe('RSVP first.');
    expect(err.retryAfterSeconds).toBeUndefined();
  });

  it('falls back to the status message when the error body is not JSON', async () => {
    fetchMock().mockResolvedValue(new Response('nope', { status: 500 }));
    const err = await sendJson('https://x/y', { method: 'POST', body: {}, label: 'save' }).catch((e) => e);
    expect(err.message).toBe('save: HTTP 500');
  });
});

describe('coercions', () => {
  it('clean coerces non-strings instead of throwing', () => {
    expect(clean(false)).toBe('false');
    expect(clean(123)).toBe('123');
    expect(clean('  x ')).toBe('x');
    expect(clean(null)).toBe('');
    expect(clean(undefined)).toBe('');
  });

  it('asArray accepts bare arrays, {items} envelopes, and garbage', () => {
    expect(asArray([1])).toEqual([1]);
    expect(asArray({ items: [2] })).toEqual([2]);
    expect(asArray({ items: 'x' })).toEqual([]);
    expect(asArray({ error: 'boom' })).toEqual([]);
    expect(asArray(null)).toEqual([]);
  });
});

describe('runGuarded (the loading/error contract)', () => {
  const states = () => {
    const seen: GuardedState<unknown>[] = [];
    return { seen, set: (s: GuardedState<unknown>) => seen.push(s) };
  };

  it('reports data and clears loading on success', async () => {
    const { seen, set } = states();
    await runGuarded(async () => 'ok', set, 'failed');
    expect(seen[0]).toEqual({ data: null, isLoading: true, error: null });
    expect(seen.at(-1)).toEqual({ data: 'ok', isLoading: false, error: null });
  });

  it('ALWAYS clears loading when the loader throws synchronously in its transform', async () => {
    // The admin#69 hang class: fetches resolve, then the view-model transform
    // throws. The contract must clear the spinner and surface the error state.
    const { seen, set } = states();
    await runGuarded(
      async () => {
        (false as unknown as string).trim();
        return 'unreachable';
      },
      set,
      'We could not load the guest list.',
    );
    expect(seen.at(-1)).toEqual({ data: null, isLoading: false, error: 'We could not load the guest list.' });
  });

  it('clears loading on rejected fetches too', async () => {
    const { seen, set } = states();
    await runGuarded(() => Promise.reject(new Error('down')), set, 'failed');
    expect(seen.at(-1)!.isLoading).toBe(false);
    expect(seen.at(-1)!.error).toBe('failed');
  });

  it('a CANCELLED load clears loading but sets no error state (#167)', async () => {
    // Walking away from a screen is not a failure of it. Loading still clears —
    // that is the guarantee this function exists for — but the reader is not
    // shown a message on the way out, and nothing is logged.
    const { seen, set } = states();
    await runGuarded(
      () => Promise.reject(new DOMException('The user aborted a request.', 'AbortError')),
      set,
      'We could not load the guest list.',
    );
    expect(seen.at(-1)).toEqual({ data: null, isLoading: false, error: null });
    expect(console.error).not.toHaveBeenCalled();
  });
});
