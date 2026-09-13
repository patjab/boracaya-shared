import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ensureGuestToken, exchangeLegacyInvite } from './guestAuth';
import { GuestEventApi } from './publicApi';

/**
 * One legacy exchange per identity per page load (shore#353).
 *
 * Since cdk#1653 the silent swap is idempotent: of two racing `/auth/exchange`
 * calls for the same guest, exactly one gets the `invitationToken` back. Shore
 * makes both on one page load — the link resolver (which needs the token) and
 * the reservations calls on mount (which only need the session). If the
 * reservations call won the race the resolver saw no token, the guest stayed on
 * their old link, and the host's "still on old links" count never moved.
 *
 * These pin the invariant that closes it: concurrent callers share ONE request,
 * whichever of them asks first, and the token reaches the caller that reads it.
 */

const store = new Map<string, string>();

beforeEach(() => {
  store.clear();
  vi.unstubAllGlobals();
  vi.stubGlobal('sessionStorage', {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  });
});

const b64url = (s: string) =>
  btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const jwt = (claims: Record<string, unknown>) =>
  `${b64url('{"alg":"HS256"}')}.${b64url(JSON.stringify(claims))}.${b64url('sig')}`;

/** A fetch that answers the FIRST exchange with the swap token and every later one without —
 *  exactly cdk#1653's condition — and resolves only when the test releases it. */
function stubServer() {
  const token = jwt({ sub: 'u1', evt: 'evt-9' });
  const release: Array<() => void> = [];
  let minted = false;
  const spy = vi.fn((url: string) => new Promise<Response>((resolve) => {
    expect(url).toBe(GuestEventApi.exchange('evt-9'));
    const body: Record<string, unknown> = { token, exp: 9999999999, linkedEmail: null };
    if (!minted) { body.invitationToken = 'swapped-token'; minted = true; }
    release.push(() => resolve({ status: 200, ok: true, json: async () => body } as Response));
  }));
  vi.stubGlobal('fetch', spy);
  return { spy, token, releaseAll: () => release.splice(0).forEach((r) => r()) };
}

describe('one legacy exchange per identity (shore#353)', () => {
  it('a reservations call that fires first does not take the swap token away from the resolver', async () => {
    const server = stubServer();
    // Child effects run before parent effects in React: the reservations call asks first.
    const session = ensureGuestToken('evt-9', 'u1');
    const swap = exchangeLegacyInvite('evt-9', 'u1');
    await Promise.resolve();
    expect(server.spy, 'one request for two callers').toHaveBeenCalledTimes(1);
    server.releaseAll();
    expect(await session).toBe(server.token);
    expect(await swap).toEqual({ kind: 'ok', token: server.token, userId: 'u1', invitationToken: 'swapped-token' });
  });

  it('the resolver asking first still leaves the reservations call with a session, on the same request', async () => {
    const server = stubServer();
    const swap = exchangeLegacyInvite('evt-9', 'u1');
    const session = ensureGuestToken('evt-9', 'u1');
    await Promise.resolve();
    expect(server.spy).toHaveBeenCalledTimes(1);
    server.releaseAll();
    expect((await swap).kind).toBe('ok');
    expect(await session).toBe(server.token);
  });

  it('once the flight lands, later callers read the cache and the network stays quiet', async () => {
    const server = stubServer();
    const swap = exchangeLegacyInvite('evt-9', 'u1');
    server.releaseAll();
    await swap;
    expect(await ensureGuestToken('evt-9', 'u1')).toBe(server.token);
    expect(server.spy).toHaveBeenCalledTimes(1);
  });

  it('different identities are different flights', async () => {
    const server = stubServer();
    void exchangeLegacyInvite('evt-9', 'u1');
    void ensureGuestToken('evt-9', 'u2');
    await Promise.resolve();
    expect(server.spy).toHaveBeenCalledTimes(2);
    server.releaseAll();
  });

  it('the same userId in two events is two flights, and each caller gets its own event's session', async () => {
    // Tokens are event-scoped (cdk#427): one flight per (event, userId), never per userId.
    const byEvent: Record<string, string> = {
      [GuestEventApi.exchange('evt-9')]: jwt({ sub: 'u1', evt: 'evt-9' }),
      [GuestEventApi.exchange('evt-8')]: jwt({ sub: 'u1', evt: 'evt-8' }),
    };
    const spy = vi.fn(async (url: string) => ({
      status: 200, ok: true, json: async () => ({ token: byEvent[url], exp: 9999999999, invitationToken: 'swap' }),
    } as Response));
    vi.stubGlobal('fetch', spy);
    const [nine, eight] = await Promise.all([
      exchangeLegacyInvite('evt-9', 'u1'),
      ensureGuestToken('evt-8', 'u1'),
    ]);
    expect(spy).toHaveBeenCalledTimes(2);
    expect(nine).toMatchObject({ kind: 'ok', token: byEvent[GuestEventApi.exchange('evt-9')] });
    expect(eight).toBe(byEvent[GuestEventApi.exchange('evt-8')]);
  });

  it('caches under the JWT's canonical subject, so a merged identity is a cache hit for its canonical id', async () => {
    // A tombstoned link: the URL says old-id, the mint's `sub` says canonical (#373 D3a).
    const token = jwt({ sub: 'canonical', evt: 'evt-9' });
    const spy = vi.fn(async () => ({
      status: 200, ok: true, json: async () => ({ token, exp: 9999999999 }),
    } as Response));
    vi.stubGlobal('fetch', spy);
    expect(await ensureGuestToken('evt-9', 'old-id')).toBe(token);
    expect(JSON.parse(store.get('pdab_guest_token')!)).toMatchObject({ userId: 'canonical', eventId: 'evt-9' });
    // The store's `actions.replace(canonical)` moves every consumer onto the canonical id;
    // their next call is served from the cache the exchange wrote.
    expect(await ensureGuestToken('evt-9', 'canonical')).toBe(token);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('a failed flight is not pinned: the next caller gets a fresh request', async () => {
    const spy = vi.fn(async () => ({ status: 500, ok: false, json: async () => ({}) } as Response));
    vi.stubGlobal('fetch', spy);
    expect(await ensureGuestToken('evt-9', 'u1')).toBeNull();
    expect(await exchangeLegacyInvite('evt-9', 'u1')).toEqual({ kind: 'error' });
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('a refused identity gives the reservations caller no token and the resolver the refusal', async () => {
    const spy = vi.fn(async () => ({
      status: 403, ok: false, json: async () => ({ error: 'invitation link replaced' }),
    } as Response));
    vi.stubGlobal('fetch', spy);
    const session = ensureGuestToken('evt-9', 'u1');
    const swap = exchangeLegacyInvite('evt-9', 'u1');
    expect(await session).toBeNull();
    expect(await swap).toEqual({ kind: 'replaced' });
    expect(spy, 'one request answered both').toHaveBeenCalledTimes(1);
  });
});
