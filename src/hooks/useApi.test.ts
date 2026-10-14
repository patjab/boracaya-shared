// @vitest-environment jsdom
/** useApi attaches the Google ID token only to first-party API hosts (shared#199). */
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../auth', () => ({ authHeaders: () => ({ Authorization: 'Bearer h.e30.s' }) }));

import { useApi } from './useApi';

describe('useApi', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  const sentAuth = (): string | undefined =>
    (fetchMock.mock.calls[0][1] as RequestInit & { headers: Record<string, string> }).headers.Authorization;

  beforeEach(() => {
    fetchMock = vi.fn(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  const run = async (url: string, options?: RequestInit) => {
    const { result } = renderHook(() => useApi(url, options));
    await act(async () => { await result.current.execute(); });
  };

  it('sends the token to an API host', async () => {
    await run('https://valet-api.boracaya.com/events');
    expect(sentAuth()).toBe('Bearer h.e30.s');
  });

  it('does not send the token to any other host', async () => {
    await run('https://example.com/steal');
    expect(sentAuth()).toBeUndefined();
  });

  it('a caller-supplied Authorization header still wins', async () => {
    await run('https://valet-api.boracaya.com/events', { headers: { Authorization: 'Bearer explicit' } });
    expect(sentAuth()).toBe('Bearer explicit');
  });
});
