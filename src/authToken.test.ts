// @vitest-environment jsdom
/**
 * The token is held in MODULE SCOPE, not sessionStorage (valet#640).
 *
 * These pin the two halves that matter: the credential never comes to rest in
 * storage, and the one-shot bootstrap that keeps `boracaya-e2e`'s `loginAdmin`
 * working still adopts a seeded token — and then removes it.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const ID_TOKEN_KEY = 'pdab_id_token';

/** A JWT with the given claims. Only the payload segment is ever parsed. */
const jwt = (claims: Record<string, unknown>): string =>
  `h.${btoa(JSON.stringify(claims)).replace(/\+/g, '-').replace(/\//g, '_')}.s`;

const future = () => Math.floor(Date.now() / 1000) + 3600;
const past = () => Math.floor(Date.now() / 1000) - 3600;

/** Re-import with a clean module registry so the bootstrap runs again. */
const freshModule = async () => {
  vi.resetModules();
  return import('./authToken');
};

beforeEach(() => {
  sessionStorage.clear();
});

describe('token storage (valet#640)', () => {
  it('never writes the credential to sessionStorage', async () => {
    const m = await freshModule();
    m.setIdToken(jwt({ exp: future(), email: 'a@b.com' }));

    expect(sessionStorage.getItem(ID_TOKEN_KEY)).toBeNull();
    expect(sessionStorage.length).toBe(0);
    // …and it is still usable, so the assertion above is not passing by virtue
    // of the token having gone missing entirely.
    expect(m.getIdToken()).not.toBeNull();
  });

  it('does not survive a page load — the point of the change', async () => {
    const first = await freshModule();
    first.setIdToken(jwt({ exp: future() }));
    expect(first.getIdToken()).not.toBeNull();

    // A fresh module registry is a new page load: nothing carries over.
    const second = await freshModule();
    expect(second.getIdToken()).toBeNull();
  });

  it('clearIdToken drops the credential', async () => {
    const m = await freshModule();
    m.setIdToken(jwt({ exp: future() }));
    m.clearIdToken();
    expect(m.getIdToken()).toBeNull();
    expect(m.authHeaders()).toEqual({});
  });
});

describe('the e2e bootstrap seam', () => {
  it('adopts a token seeded before page JS ran', async () => {
    sessionStorage.setItem(ID_TOKEN_KEY, jwt({ exp: future(), email: 'ci@boracaya.com' }));
    const m = await freshModule();

    expect(m.getIdToken()).not.toBeNull();
    expect(m.getEmail()).toBe('ci@boracaya.com');
  });

  it('removes the seed once adopted, so it is not left at rest', async () => {
    sessionStorage.setItem(ID_TOKEN_KEY, jwt({ exp: future() }));
    const m = await freshModule();

    expect(sessionStorage.getItem(ID_TOKEN_KEY)).toBeNull();
    expect(m.getIdToken()).not.toBeNull();
  });

  it('is unauthenticated when nothing was seeded', async () => {
    const m = await freshModule();
    expect(m.getIdToken()).toBeNull();
    expect(m.authHeaders()).toEqual({});
  });

  it('survives storage that throws outright (private mode, blocked site data)', async () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError');
    });
    // The bootstrap must not take the module down with it.
    const m = await freshModule();
    expect(m.getIdToken()).toBeNull();
    spy.mockRestore();
  });
});

describe('expiry and claims still hold', () => {
  it('treats an expired token as absent and forgets it', async () => {
    const m = await freshModule();
    m.setIdToken(jwt({ exp: past() }));
    expect(m.getIdToken()).toBeNull();
    // Forgotten, not merely reported absent: a second read agrees.
    expect(m.getIdToken()).toBeNull();
    expect(m.authHeaders()).toEqual({});
  });

  it('attaches a live token as a bearer header', async () => {
    const m = await freshModule();
    const token = jwt({ exp: future() });
    m.setIdToken(token);
    expect(m.authHeaders()).toEqual({ Authorization: `Bearer ${token}` });
  });

  it('reads the email claim, and reports null for an unparseable token', async () => {
    const m = await freshModule();
    m.setIdToken(jwt({ exp: future(), email: 'organizer@boracaya.com' }));
    expect(m.getEmail()).toBe('organizer@boracaya.com');

    m.setIdToken('not-a-jwt');
    expect(m.getIdToken()).toBeNull();
    expect(m.getEmail()).toBeNull();
  });
});
