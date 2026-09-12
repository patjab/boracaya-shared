import { describe, it, expect, beforeEach, vi } from 'vitest';
import { loginNoEvent } from './guestAuth';
import { ApiConstants } from './api';

/**
 * Unit branches for the no-event login client (cdk#623, Option D). Hermetic: fetch +
 * sessionStorage are stubbed, no network. The behavioral proof against the deployed
 * backend is the e2e narrative (narrative-guest-no-event-login.spec.ts); this pins the
 * status→result mapping and that a 200 caches the token keyed to the resolved event.
 *
 * (Runs under the default `npm test`, which runs every suite except the live
 * network smoke tests.)
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

  it('zero events (404) → none, no token cached', async () => {
    stubFetch(404, { error: 'no invitation found' });
    const res = await loginNoEvent('cred');
    expect(res).toEqual({ kind: 'none' });
    expect(store.has('pdab_guest_token')).toBe(false);
  });

  it('several events (300) → choose, with exactly the rows the backend named, and no token cached (U68)', async () => {
    stubFetch(300, { events: [
      { eventId: 'evt-1', name: 'Ana & Bo', date: '2027-03-14' },
      { eventId: 'evt-2', date: '2027-06-01' }, // context is best-effort per row
      { eventId: 'evt-3', name: 'Cy', extra: 'not part of the contract' },
    ] });
    const res = await loginNoEvent('cred');
    expect(res).toEqual({ kind: 'choose', events: [
      { eventId: 'evt-1', name: 'Ana & Bo', date: '2027-03-14' },
      { eventId: 'evt-2', date: '2027-06-01' },
      { eventId: 'evt-3', name: 'Cy' },
    ] });
    expect(store.has('pdab_guest_token')).toBe(false);
  });

  it('exactly two memberships is a chooser -- the boundary the backend answers 300 from (Codex r2 on #173)', async () => {
    stubFetch(300, { events: [{ eventId: 'evt-a', name: 'A' }, { eventId: 'evt-b', name: 'B' }] });
    expect(await loginNoEvent('cred')).toEqual({ kind: 'choose', events: [
      { eventId: 'evt-a', name: 'A' }, { eventId: 'evt-b', name: 'B' },
    ] });
  });

  it('a 300 that does not carry two usable rows is an error, never an empty chooser', async () => {
    stubFetch(300, { events: [{ eventId: 'only-one' }] });
    expect(await loginNoEvent('cred')).toEqual({ kind: 'error' });
    stubFetch(300, { events: [{ name: 'no id' }, { eventId: 42 }] });
    expect(await loginNoEvent('cred')).toEqual({ kind: 'error' });
    stubFetch(300, {});
    expect(await loginNoEvent('cred')).toEqual({ kind: 'error' });
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
