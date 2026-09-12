import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  exchangeInvitationToken,
  exchangeLegacyInvite,
  guestSubjectFromToken,
} from './guestAuth';
import { GuestEventApi } from './publicApi';

/**
 * The invitation-token client (cdk#1566, U01). Hermetic: fetch and
 * sessionStorage are stubbed, no network.
 *
 * What these pin: the new lane learns the guest's canonical id from the JWT's
 * own `sub` (the response body deliberately carries no userId), a legacy link
 * past its grace period is distinguished from an unknown one, and the silent
 * swap's fresh token reaches the caller.
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

/** A shaped (unsigned) guest JWT — only its payload is read client-side. */
const jwt = (claims: Record<string, unknown>) =>
  `${b64url('{"alg":"HS256"}')}.${b64url(JSON.stringify(claims))}.${b64url('sig')}`;

function stubFetch(expectedUrl: string, status: number, body: unknown) {
  const spy = vi.fn(async (url: string) => {
    expect(url).toBe(expectedUrl);
    return { status, ok: status >= 200 && status < 300, json: async () => body } as Response;
  });
  vi.stubGlobal('fetch', spy);
  return spy;
}

const cached = () => JSON.parse(store.get('pdab_guest_token')!);

describe('guestSubjectFromToken', () => {
  it('reads the canonical id out of the JWT the server minted', () => {
    expect(guestSubjectFromToken(jwt({ sub: 'u1', evt: 'evt-9' }))).toBe('u1');
  });

  it('is null for anything that is not a usable token', () => {
    expect(guestSubjectFromToken(null)).toBeNull();
    expect(guestSubjectFromToken('')).toBeNull();
    expect(guestSubjectFromToken('not-a-jwt')).toBeNull();
    expect(guestSubjectFromToken(jwt({ evt: 'evt-9' }))).toBeNull(); // no sub
    expect(guestSubjectFromToken(jwt({ sub: '' }))).toBeNull();
  });
});

describe('exchangeInvitationToken (the ?invite= lane)', () => {
  it('mints a session and learns the userId from the token, not the body', async () => {
    const token = jwt({ sub: 'u1', evt: 'evt-9' });
    // Note the response body has NO userId — that is the point of cdk#1566.
    stubFetch(GuestEventApi.guestToken('evt-9'), 200,
      { token, exp: 9999999999, linkedEmail: 'a@b.co' });

    const res = await exchangeInvitationToken('evt-9', 'raw-token');

    expect(res).toEqual({ kind: 'ok', token, userId: 'u1' });
    expect(cached()).toMatchObject({ token, userId: 'u1', eventId: 'evt-9', linkedEmail: 'a@b.co' });
  });

  it('sends the token in the body and never in the URL', async () => {
    const spy = stubFetch(GuestEventApi.guestToken('evt-9'), 200,
      { token: jwt({ sub: 'u1' }), exp: 9999999999 });

    await exchangeInvitationToken('evt-9', 'raw-token');

    const [url, init] = spy.mock.calls[0] as [string, RequestInit];
    expect(url).not.toContain('raw-token');
    expect(JSON.parse(init.body as string)).toEqual({ token: 'raw-token' });
  });

  it('403 is `unknown` — revoked, wrong event and never-issued are one answer', async () => {
    stubFetch(GuestEventApi.guestToken('evt-9'), 403, { error: 'unknown invitation' });
    expect(await exchangeInvitationToken('evt-9', 'raw-token')).toEqual({ kind: 'unknown' });
    expect(store.size).toBe(0);
  });

  it('a 500 is an error the caller may retry, and caches nothing', async () => {
    stubFetch(GuestEventApi.guestToken('evt-9'), 500, { error: 'lookup failed' });
    expect(await exchangeInvitationToken('evt-9', 'raw-token')).toEqual({ kind: 'error' });
    expect(store.size).toBe(0);
  });

  it('a token whose payload names no subject is an error, never a session', async () => {
    stubFetch(GuestEventApi.guestToken('evt-9'), 200,
      { token: jwt({ evt: 'evt-9' }), exp: 9999999999 });
    expect(await exchangeInvitationToken('evt-9', 'raw-token')).toEqual({ kind: 'error' });
    expect(store.size).toBe(0);
  });

  it('a missing event or token never reaches the network', async () => {
    const spy = vi.fn();
    vi.stubGlobal('fetch', spy);
    expect(await exchangeInvitationToken(null, 'raw-token')).toEqual({ kind: 'unknown' });
    expect(await exchangeInvitationToken('evt-9', null)).toEqual({ kind: 'unknown' });
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('exchangeLegacyInvite (the ?invited= lane, during the grace period)', () => {
  it('returns the freshly minted invitation token — the silent swap', async () => {
    const token = jwt({ sub: 'u1', evt: 'evt-9' });
    stubFetch(GuestEventApi.exchange('evt-9'), 200,
      { token, exp: 9999999999, userId: 'u1', invitationToken: 'fresh-token' });

    const res = await exchangeLegacyInvite('evt-9', 'u1');

    expect(res).toEqual({ kind: 'ok', token, userId: 'u1', invitationToken: 'fresh-token' });
    expect(cached()).toMatchObject({ userId: 'u1', eventId: 'evt-9' });
  });

  it('follows a tombstone: the JWT\'s sub wins over the id in the link', async () => {
    // #373 D3a — a merged link resolves to a DIFFERENT canonical id.
    const token = jwt({ sub: 'canonical', evt: 'evt-9' });
    stubFetch(GuestEventApi.exchange('evt-9'), 200, { token, exp: 9999999999 });

    const res = await exchangeLegacyInvite('evt-9', 'provisional');

    expect(res).toMatchObject({ kind: 'ok', userId: 'canonical' });
    expect(cached()).toMatchObject({ userId: 'canonical' });
  });

  it('distinguishes a link the cutoff retired from one that never existed', async () => {
    stubFetch(GuestEventApi.exchange('evt-9'), 403, { error: 'invitation link replaced' });
    expect(await exchangeLegacyInvite('evt-9', 'u1')).toEqual({ kind: 'replaced' });

    stubFetch(GuestEventApi.exchange('evt-9'), 403, { error: 'unknown invitation' });
    expect(await exchangeLegacyInvite('evt-9', 'u1')).toEqual({ kind: 'unknown' });
  });

  it('a 403 with an unreadable body is `unknown`, never `replaced`', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      status: 403, ok: false, json: async () => { throw new Error('not json'); },
    }) as unknown as Response));
    expect(await exchangeLegacyInvite('evt-9', 'u1')).toEqual({ kind: 'unknown' });
  });

  it('a swap the server could not perform still returns the session', async () => {
    const token = jwt({ sub: 'u1' });
    stubFetch(GuestEventApi.exchange('evt-9'), 200, { token, exp: 9999999999 });
    const res = await exchangeLegacyInvite('evt-9', 'u1');
    expect(res).toMatchObject({ kind: 'ok', userId: 'u1' });
    expect((res as { invitationToken?: string }).invitationToken).toBeUndefined();
  });

  it('a network throw is an error, not a crash', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
    expect(await exchangeLegacyInvite('evt-9', 'u1')).toEqual({ kind: 'error' });
  });
});
