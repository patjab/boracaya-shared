import { describe, it, expect, beforeEach, vi } from 'vitest';
import { claimIdentity, guestLinkedEmail, unlinkIdentity } from './guestAuth';
import { GuestEventApi } from './publicApi';

/**
 * `guestLinkedEmail` tells "no Google linked" apart from "could not tell" (shore#483).
 * A null used to mean either, so a failed session mint read as unlinked, the screen
 * offered Link, and the claim it started silently replaced the guest's linked Google.
 * Now null is only a confirmed answer, and an unknown state rejects. Hermetic: fetch and
 * sessionStorage are stubbed.
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
const FAR = 9999999999;
const reply = (status: number, body: unknown) =>
  ({ status, ok: status >= 200 && status < 300, json: async () => body }) as Response;

const minted = (linkedEmail: string | null, sub = 'u1') =>
  reply(200, { token: jwt({ sub, evt: 'evt-9' }), exp: FAR, linkedEmail });

describe('guestLinkedEmail (shore#483)', () => {
  it('reads the linked Google off the session it ensures, or null when none is linked', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => minted('anna@gmail.com')));
    expect(await guestLinkedEmail('evt-9', 'u1')).toBe('anna@gmail.com');

    store.clear();
    vi.stubGlobal('fetch', vi.fn(async () => minted(null)));
    expect(await guestLinkedEmail('evt-9', 'u1')).toBeNull();
  });

  it('rejects when no session can be minted: a 429, a 5xx, a WAF 403, a network failure', async () => {
    const failures: Array<() => Promise<Response>> = [
      async () => reply(429, { message: 'Too Many Requests' }),
      async () => reply(500, { error: 'lookup failed' }),
      async () => reply(503, {}),
      async () => ({ status: 403, ok: false, json: async () => { throw new SyntaxError('waf'); } }) as unknown as Response,
      async () => { throw new TypeError('Failed to fetch'); },
    ];
    for (const failure of failures) {
      vi.stubGlobal('fetch', vi.fn(failure));
      await expect(guestLinkedEmail('evt-9', 'u1')).rejects.toThrow();
    }
  });

  it('rejects when the server refuses the id, or an id is missing', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => reply(403, { error: 'unknown invitation' })));
    await expect(guestLinkedEmail('evt-9', 'u1')).rejects.toThrow();
    await expect(guestLinkedEmail(null, 'u1')).rejects.toThrow();
    await expect(guestLinkedEmail('evt-9', undefined)).rejects.toThrow();
  });

  it('rejects when the session minted is a different identity’s (a merge): its link is not this id’s', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => minted('anna@gmail.com', 'u-canonical')));
    await expect(guestLinkedEmail('evt-9', 'u-old')).rejects.toThrow();
    expect(await guestLinkedEmail('evt-9', 'u-canonical')).toBe('anna@gmail.com');
  });

  it('a retry after a failure loads the real linked email', async () => {
    const spy = vi.fn(async () => reply(429, {}));
    vi.stubGlobal('fetch', spy);
    await expect(guestLinkedEmail('evt-9', 'u1')).rejects.toThrow();
    spy.mockImplementation(async () => minted('anna@gmail.com'));
    expect(await guestLinkedEmail('evt-9', 'u1')).toBe('anna@gmail.com');
  });

  it('follows the session’s own linkedEmail through a claim and an unlink', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url === GuestEventApi.claim('evt-9')) {
        return reply(200, { token: jwt({ sub: 'u1', evt: 'evt-9' }), exp: FAR, userId: 'u1', claimed: true, linkedEmail: 'bob@gmail.com' });
      }
      if (url === GuestEventApi.unlink('evt-9')) return reply(200, {});
      return minted('anna@gmail.com');
    }));
    await claimIdentity({ eventId: 'evt-9', credential: 'g' });
    expect(await guestLinkedEmail('evt-9', 'u1')).toBe('bob@gmail.com');
    await unlinkIdentity('evt-9');
    expect(await guestLinkedEmail('evt-9', 'u1')).toBeNull();
  });
});
