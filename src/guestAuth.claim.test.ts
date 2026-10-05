import { describe, it, expect, beforeEach, vi } from 'vitest';
import { claimIdentity } from './guestAuth';
import { GuestEventApi } from './publicApi';

/**
 * The invite-session claim proves the session and never replaces a bound Google (cdk#1763).
 *
 * After cdk#1763 the backend's userId lane of POST /events/{eventId}/auth/claim wants proof
 * that the caller holds THIS guest's invite session (a bare userId is a public identifier,
 * cdk#1566), and refuses to replace an identity's bound Google with a 409 that carries no
 * `candidates` (the #1566 B2 decision). These pin the client half: the guest's own session
 * rides the claim as a bearer header, and that 409 reads as "unlink first", not as an empty
 * chooser.
 */

const TOKEN_KEY = 'pdab_guest_token';
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

const FAR = 9999999999;
const session = (userId: string, eventId = 'evt-9', token = jwt({ sub: userId, evt: eventId })) => {
  store.set(TOKEN_KEY, JSON.stringify({ token, exp: FAR, userId, eventId, linkedEmail: 'anna@example.com' }));
  return token;
};

const reply = (status: number, body: unknown) =>
  ({ status, ok: status >= 200 && status < 300, json: async () => body }) as Response;

/** A fetch that routes by URL: the claim answers `claim`, the legacy exchange `exchange`. */
function stubServer(claim: Response, exchange: Response = reply(403, { error: 'invitation link replaced' })) {
  const spy = vi.fn(async (url: string, _init?: RequestInit) =>
    url === GuestEventApi.claim('evt-9') ? claim : exchange);
  vi.stubGlobal('fetch', spy);
  const claimCall = () => spy.mock.calls.find(([url]) => url === GuestEventApi.claim('evt-9'));
  return {
    spy,
    claimHeaders: () => (claimCall()?.[1]?.headers ?? {}) as Record<string, string>,
    claimBody: () => JSON.parse(String(claimCall()?.[1]?.body)) as Record<string, unknown>,
    exchanges: () => spy.mock.calls.filter(([url]) => url === GuestEventApi.exchange('evt-9')).length,
  };
}

const minted = (userId: string) =>
  reply(200, { token: jwt({ sub: userId, evt: 'evt-9' }), exp: FAR, userId, claimed: false, linkedEmail: 'bob@example.com' });

describe('the invite-session claim proves the session (cdk#1763)', () => {
  it('sends this guest\'s cached session as the bearer, and nothing else changes on the wire', async () => {
    const token = session('u1');
    const server = stubServer(minted('u1'));
    const result = await claimIdentity({ eventId: 'evt-9', credential: 'google-cred', userId: 'u1' });
    expect(result).toEqual({ kind: 'ok', userId: 'u1', claimed: false, linkedEmail: 'bob@example.com' });
    expect(server.claimHeaders()).toEqual({ 'Content-Type': 'application/json', Authorization: `Bearer ${token}` });
    // The body is the pre-#1763 body: the proof is a header, never a new field.
    expect(server.claimBody()).toEqual({ credential: 'google-cred', userId: 'u1' });
    expect(server.exchanges(), 'a live session needs no exchange').toBe(0);
  });

  it('ensures a session first when none is cached (the reservations calls\' path), then proves it', async () => {
    const exchanged = jwt({ sub: 'u1', evt: 'evt-9' });
    const server = stubServer(minted('u1'), reply(200, { token: exchanged, exp: FAR, linkedEmail: null }));
    await claimIdentity({ eventId: 'evt-9', credential: 'google-cred', userId: 'u1' });
    expect(server.exchanges()).toBe(1);
    expect(server.claimHeaders().Authorization).toBe(`Bearer ${exchanged}`);
    // The exchange lands before the claim goes out, so the claim's own cache write wins.
    expect(JSON.parse(store.get(TOKEN_KEY)!).linkedEmail).toBe('bob@example.com');
  });

  it('never presents another identity\'s (or another event\'s) session', async () => {
    session('u2');
    const server = stubServer(minted('u1'));
    await claimIdentity({ eventId: 'evt-9', credential: 'google-cred', userId: 'u1' });
    expect(server.claimHeaders().Authorization, 'u2\'s token must not prove u1').toBeUndefined();

    store.clear();
    session('u1', 'evt-other');
    const again = stubServer(minted('u1'));
    await claimIdentity({ eventId: 'evt-9', credential: 'google-cred', userId: 'u1' });
    expect(again.claimHeaders().Authorization, 'tokens are event-scoped (cdk#427)').toBeUndefined();
  });

  it('with no session to be had, still claims: header-less is the request every older client sent', async () => {
    const server = stubServer(minted('u1')); // the legacy exchange answers 403 replaced
    const result = await claimIdentity({ eventId: 'evt-9', credential: 'google-cred', userId: 'u1' });
    expect(result.kind).toBe('ok');
    expect(server.claimHeaders()).toEqual({ 'Content-Type': 'application/json' });
  });

  it('a storage fault while reading the session does not fail the claim', async () => {
    vi.stubGlobal('sessionStorage', {
      getItem: () => { throw new Error('SecurityError'); },
      setItem: () => undefined,
      removeItem: () => undefined,
    });
    const server = stubServer(minted('u1'));
    const result = await claimIdentity({ eventId: 'evt-9', credential: 'google-cred', userId: 'u1' });
    expect(result.kind).toBe('ok');
    expect(server.claimHeaders().Authorization).toBeUndefined();
  });

  it('the Google-first login lane (no userId) sends no bearer and makes no exchange, even with a session cached', async () => {
    session('u1');
    const server = stubServer(minted('u1'));
    await claimIdentity({ eventId: 'evt-9', credential: 'google-cred' });
    expect(server.claimHeaders()).toEqual({ 'Content-Type': 'application/json' });
    expect(server.exchanges()).toBe(0);
  });
});

describe('a 409 with no candidates is "unlink first" (cdk#1763, the #1566 B2 decision)', () => {
  const B2 = { error: 'a different Google account is already linked to this invitation; unlink it first' };

  it('reads the B2 refusal as unlinkFirst and leaves the cached session untouched', async () => {
    session('u1');
    const before = store.get(TOKEN_KEY);
    stubServer(reply(409, B2));
    const result = await claimIdentity({ eventId: 'evt-9', credential: 'google-cred', userId: 'u1' });
    expect(result).toEqual({ kind: 'unlinkFirst' });
    // Nothing was bound and nothing minted: the guest's session (and its linkedEmail) stand.
    expect(store.get(TOKEN_KEY)).toBe(before);
  });

  it('an empty candidates list or an unreadable body is the same refusal, never an empty chooser', async () => {
    stubServer(reply(409, { candidates: [] }));
    expect(await claimIdentity({ eventId: 'evt-9', credential: 'c', userId: 'u1' })).toEqual({ kind: 'unlinkFirst' });
    vi.stubGlobal('fetch', vi.fn(async (url: string) => (url === GuestEventApi.claim('evt-9')
      ? ({ status: 409, ok: false, json: async () => { throw new SyntaxError('not json'); } } as unknown as Response)
      : reply(403, {}))));
    expect(await claimIdentity({ eventId: 'evt-9', credential: 'c', userId: 'u1' })).toEqual({ kind: 'unlinkFirst' });
  });

  it('a 409 that names candidates is still the chooser, on either lane', async () => {
    const candidates = [{ userId: 'u1', label: 'Anna' }, { userId: 'u7', label: 'Guest' }];
    stubServer(reply(409, { error: 'multiple identities', candidates }));
    expect(await claimIdentity({ eventId: 'evt-9', credential: 'c', userId: 'u3' })).toEqual({ kind: 'chooser', candidates });
    expect(await claimIdentity({ eventId: 'evt-9', credential: 'c' })).toEqual({ kind: 'chooser', candidates });
  });

  it('on the login lane a candidate-less 409 is a retryable error: there is nothing to unlink there', async () => {
    stubServer(reply(409, B2));
    expect(await claimIdentity({ eventId: 'evt-9', credential: 'c' })).toEqual({ kind: 'error' });
  });
});
