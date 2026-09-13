import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { hasGuestSession } from './guestAuth';

/** `hasGuestSession` (cdk#1658): a cache read, never a network call. */
const store = new Map<string, string>();
beforeEach(() => {
  store.clear();
  vi.unstubAllGlobals();
  vi.stubGlobal('sessionStorage', {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  });
  fetchSpy = vi.fn(() => { throw new Error('hasGuestSession must not touch the network'); });
  vi.stubGlobal('fetch', fetchSpy);
});
// The no-network contract is asserted, not merely made to throw: the function
// catches everything and answers false, so a throwing stub alone would hide a
// mutation that reached for fetch on a cache miss (Codex r2 on #178).
let fetchSpy: ReturnType<typeof vi.fn>;
afterEach(() => {
  expect(fetchSpy).not.toHaveBeenCalled();
});

const cache = (entry: Record<string, unknown>) => store.set('pdab_guest_token', JSON.stringify(entry));
const soon = Math.floor(Date.now() / 1000) + 3600;

describe('hasGuestSession', () => {
  it('is true for a live cached session of this event and guest', () => {
    cache({ token: 'jwt', exp: soon, userId: 'u1', eventId: 'evt-9' });
    expect(hasGuestSession('evt-9', 'u1')).toBe(true);
  });
  it('is false for another guest, another event, or an expired session', () => {
    cache({ token: 'jwt', exp: soon, userId: 'u1', eventId: 'evt-9' });
    expect(hasGuestSession('evt-9', 'u2')).toBe(false);
    expect(hasGuestSession('evt-8', 'u1')).toBe(false);
    cache({ token: 'jwt', exp: Math.floor(Date.now() / 1000) - 1, userId: 'u1', eventId: 'evt-9' });
    expect(hasGuestSession('evt-9', 'u1')).toBe(false);
  });
  it('is false with nothing cached, a corrupt entry, missing ids, or no storage', () => {
    expect(hasGuestSession('evt-9', 'u1')).toBe(false);
    store.set('pdab_guest_token', '{not json');
    expect(hasGuestSession('evt-9', 'u1')).toBe(false);
    expect(hasGuestSession(null, 'u1')).toBe(false);
    expect(hasGuestSession('evt-9', undefined)).toBe(false);
    vi.stubGlobal('sessionStorage', { getItem: () => { throw new Error('blocked'); } });
    expect(hasGuestSession('evt-9', 'u1')).toBe(false);
  });
});
