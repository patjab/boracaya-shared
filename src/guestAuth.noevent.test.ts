import { describe, it, expect, beforeEach, vi } from 'vitest';
import { loginNoEvent } from './guestAuth';
import { ApiConstants } from './api';

/**
 * Unit branches for the no-event login client (cdk#623, Option D). Hermetic: fetch +
 * sessionStorage are stubbed, no network. The behavioral proof against the deployed
 * backend is the e2e narrative (narrative-guest-no-event-login.spec.ts); this pins the
 * status→result mapping and that a 200 caches the token keyed to the resolved event.
 *
 * (Not run by the default `npm test`, which is the contract test only; run under
 * `npm run test:all`.)
 */

const store = new Map<string, string>();

beforeEach(() => {
  store.clear();
  vi.stubGlobal('sessionStorage', {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  });
});

function stubFetch(status: number, body: unknown): void {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    expect(url).toBe(ApiConstants.GUEST_LOGIN); // always the unscoped route
    return { status, json: async () => body } as Response;
  }));
}

describe('loginNoEvent (cdk#623)', () => {
  it('exactly one event → ok, and caches the token keyed to the resolved event', async () => {
    stubFetch(200, { token: 'jwt.abc', exp: 9999999999, userId: 'u1', eventId: 'evt-9' });
    const res = await loginNoEvent('cred');
    expect(res).toEqual({ kind: 'ok', userId: 'u1', eventId: 'evt-9' });
    const cached = JSON.parse(store.get('pdab_guest_token')!);
    expect(cached).toMatchObject({ token: 'jwt.abc', userId: 'u1', eventId: 'evt-9' });
  });

  it('zero or many events (404) → none, no token cached', async () => {
    stubFetch(404, { error: 'no invitation found' });
    const res = await loginNoEvent('cred');
    expect(res).toEqual({ kind: 'none' });
    expect(store.has('pdab_guest_token')).toBe(false);
  });

  it('rejected credential (401) → invalid', async () => {
    stubFetch(401, { error: 'invalid credential' });
    expect(await loginNoEvent('cred')).toEqual({ kind: 'invalid' });
  });

  it('any other status (500) → error', async () => {
    stubFetch(500, { error: 'login failed' });
    expect(await loginNoEvent('cred')).toEqual({ kind: 'error' });
  });

  it('a thrown fetch → error (never rejects)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('network'); }));
    expect(await loginNoEvent('cred')).toEqual({ kind: 'error' });
  });
});
