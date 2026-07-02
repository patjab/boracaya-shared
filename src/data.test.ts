import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, asArray, clean, getJson, jsonOr, runGuarded, sendJson, GuardedState } from './data';

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

  it("prefers the server's own error message on non-2xx", async () => {
    fetchMock().mockResolvedValue(jsonResponse({ error: 'A template with that name already exists.' }, 409));
    const err = await sendJson('https://x/y', { method: 'PUT', body: {}, label: 'create' }).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(409);
    expect(err.message).toBe('A template with that name already exists.');
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
});
