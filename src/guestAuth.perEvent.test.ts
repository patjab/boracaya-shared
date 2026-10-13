import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  clearGuestToken,
  ensureGuestToken,
  exchangeInvitationToken,
  guestTokenExpiresInSeconds,
  hasGuestSession,
  refreshGuestSession,
} from './guestAuth';
import { GuestEventApi } from './publicApi';

/**
 * One cached session per event (shore#529). A guest invited to two events holds both
 * sessions in one tab: minting, renewing or clearing one event's session leaves the
 * other's alone, and an entry in the old single shared slot is still read for its own
 * event and moved to that event's key on the next write. Hermetic: fetch and
 * sessionStorage are stubbed, no network.
 */

const LEGACY_KEY = 'pdab_guest_token';
const store = new Map<string, string>();

beforeEach(() => {
  store.clear();
  vi.unstubAllGlobals();
  vi.stubGlobal('sessionStorage', {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    get length() { return store.size; },
    key: (i: number) => [...store.keys()][i] ?? null,
  });
});

const b64url = (s: string) =>
  btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const jwt = (claims: Record<string, unknown>) =>
  `${b64url('{"alg":"HS256"}')}.${b64url(JSON.stringify(claims))}.${b64url('sig')}`;

const FAR = 9999999999;
const reply = (status: number, body: unknown) =>
  ({ status, ok: status >= 200 && status < 300, json: async () => body }) as Response;

/** A server that mints `sub` = `u<event letter>` on each event's token lane. */
function stubMints() {
  const spy = vi.fn(async (url: string) => {
    for (const evt of ['evA', 'evB']) {
      if (url === GuestEventApi.guestToken(evt) || url === GuestEventApi.refresh(evt)) {
        const sub = `u${evt.slice(2)}`;
        return reply(200, { token: jwt({ sub, evt, n: Math.random() }), exp: FAR });
      }
    }
    return reply(500, {});
  });
  vi.stubGlobal('fetch', spy);
  return spy;
}

describe('guest sessions are cached per event (shore#529)', () => {
  it('a session for event B leaves event A’s session usable in the same tab', async () => {
    const spy = stubMints();
    const a = await exchangeInvitationToken('evA', 'tA');
    const b = await exchangeInvitationToken('evB', 'tB');

    expect(hasGuestSession('evA', 'uA')).toBe(true);
    expect(hasGuestSession('evB', 'uB')).toBe(true);
    // Back on A: served from A's cache, no exchange (and so no legacy lane).
    spy.mockClear();
    expect(await ensureGuestToken('evA', 'uA')).toBe(a.kind === 'ok' ? a.token : null);
    expect(await ensureGuestToken('evB', 'uB')).toBe(b.kind === 'ok' ? b.token : null);
    expect(spy).not.toHaveBeenCalled();
  });

  it('clearing one event’s session keeps the other’s; clearing with no event drops them all', async () => {
    stubMints();
    await exchangeInvitationToken('evA', 'tA');
    await exchangeInvitationToken('evB', 'tB');

    clearGuestToken('evB');
    expect(hasGuestSession('evB', 'uB')).toBe(false);
    expect(hasGuestSession('evA', 'uA')).toBe(true);

    await exchangeInvitationToken('evB', 'tB');
    clearGuestToken();
    expect(hasGuestSession('evA', 'uA')).toBe(false);
    expect(hasGuestSession('evB', 'uB')).toBe(false);
    expect(store.size).toBe(0);
  });

  it('renewing one event’s session never touches the other’s', async () => {
    stubMints();
    await exchangeInvitationToken('evA', 'tA');
    await exchangeInvitationToken('evB', 'tB');
    const before = store.get('pdab_guest_token:evB');

    expect(await refreshGuestSession('evA')).toMatchObject({ kind: 'ok', userId: 'uA' });
    expect(store.get('pdab_guest_token:evB')).toBe(before);
    expect(hasGuestSession('evA', 'uA')).toBe(true);
  });

  it('reads each event’s own expiry, and with no event the session cached most recently', async () => {
    store.set('pdab_guest_token:evA', JSON.stringify({ token: 't', exp: Math.floor(Date.now() / 1000) + 600, userId: 'uA', eventId: 'evA' }));
    vi.stubGlobal('fetch', vi.fn(async () => reply(200, { token: jwt({ sub: 'uB', evt: 'evB' }), exp: Math.floor(Date.now() / 1000) + 60 })));
    await exchangeInvitationToken('evB', 'tB');

    expect(guestTokenExpiresInSeconds('evA')).toBeGreaterThan(590);
    expect(guestTokenExpiresInSeconds('evB')).toBeLessThanOrEqual(60);
    expect(guestTokenExpiresInSeconds()).toBeLessThanOrEqual(60);
    expect(guestTokenExpiresInSeconds('evC')).toBeUndefined();
  });
});

describe('an entry in the old single slot (before shore#529)', () => {
  const legacy = (eventId: string) =>
    store.set(LEGACY_KEY, JSON.stringify({ token: `old-${eventId}`, exp: FAR, userId: 'u1', eventId }));

  it('is still read for its own event, and only its own', async () => {
    legacy('evA');
    vi.stubGlobal('fetch', vi.fn(() => { throw new Error('no network expected'); }));
    expect(hasGuestSession('evA', 'u1')).toBe(true);
    expect(await ensureGuestToken('evA', 'u1')).toBe('old-evA');
    expect(hasGuestSession('evB', 'u1')).toBe(false);
  });

  it('moves to its event’s key on that event’s next write, and another event’s write leaves it', async () => {
    legacy('evA');
    stubMints();
    await exchangeInvitationToken('evB', 'tB');
    expect(store.has(LEGACY_KEY)).toBe(true); // still A's to read

    await exchangeInvitationToken('evA', 'tA');
    expect(store.has(LEGACY_KEY)).toBe(false);
    expect(JSON.parse(store.get('pdab_guest_token:evA')!)).toMatchObject({ userId: 'uA', eventId: 'evA' });
  });

  it('is cleared with its own event, never with another', () => {
    legacy('evA');
    clearGuestToken('evB');
    expect(hasGuestSession('evA', 'u1')).toBe(true);
    clearGuestToken('evA');
    expect(store.has(LEGACY_KEY)).toBe(false);
  });

  it('an event key that is corrupt or names another event is no session', () => {
    store.set('pdab_guest_token:evA', '{corrupt');
    expect(hasGuestSession('evA', 'u1')).toBe(false);
    store.set('pdab_guest_token:evA', JSON.stringify({ token: 't', exp: FAR, userId: 'u1', eventId: 'evB' }));
    expect(hasGuestSession('evA', 'u1')).toBe(false);
    store.set('pdab_guest_token:evA', 'null');
    expect(hasGuestSession('evA', 'u1')).toBe(false);
  });
});
