import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ownedContinuation } from './ownedContinuation';

let principal = 'u1';
let event = 'e1';
let key = 'k1';

describe('ownedContinuation (#166) — an async continuation that knows what it owns', () => {
  beforeEach(() => { principal = 'u1'; event = 'e1'; key = 'k1'; });

  it('owns its write while every supplied dimension is unchanged', () => {
    const own = ownedContinuation({ principal: () => principal, event: () => event });
    expect(own.stillOwns()).toBe(true);
    // Re-reading is the point: a captured SNAPSHOT would answer true forever.
    principal = 'u1';
    event = 'e1';
    expect(own.stillOwns()).toBe(true);
  });

  it.each([
    ['principal', () => { principal = 'u2'; }],
    ['event', () => { event = 'e2'; }],
    ['key', () => { key = 'k2'; }],
  ])('a change of %s ends the ownership', (_dimension, change) => {
    const own = ownedContinuation({
      principal: () => principal, event: () => event, key: () => key,
    });
    expect(own.stillOwns()).toBe(true);
    change();
    expect(own.stillOwns()).toBe(false);
  });

  it('only compares the dimensions it was given', () => {
    // Event deliberately omitted: this work does not belong to one.
    const own = ownedContinuation({ principal: () => principal });
    event = 'e2';
    expect(own.stillOwns()).toBe(true);
    principal = 'u2';
    expect(own.stillOwns()).toBe(false);
  });

  it('refuses to be owned by nothing', () => {
    // A continuation with no dimensions would answer true forever, which reads
    // at the call site exactly like a guard and is not one.
    expect(() => ownedContinuation({})).toThrow(/at least one/);
    expect(() => ownedContinuation({ principal: undefined })).toThrow(/at least one/);
  });

  it('release() aborts the signal and ends ownership, idempotently', () => {
    const own = ownedContinuation({ principal: () => 'u1' });
    expect(own.signal.aborted).toBe(false);
    own.release();
    expect(own.signal.aborted).toBe(true);
    expect(own.stillOwns()).toBe(false);
    // Teardown can run twice (an unmount racing a key switch).
    expect(() => own.release()).not.toThrow();
    expect(own.stillOwns()).toBe(false);
  });

  it('a released continuation stays disowned even if the context comes BACK', () => {
    // The subtle one. Sign out, sign back in as the same person: the values
    // read identically, but this particular request was abandoned and its
    // response must not land.
    const own = ownedContinuation({ principal: () => principal });
    principal = 'u2';
    own.release();
    principal = 'u1';
    expect(own.stillOwns()).toBe(false);
  });

  it('a value that returns to its captured state DOES own again while un-released', () => {
    // Stated so the contract is not a surprise: ownership is about the values,
    // not about the history of changes. Callers that need "was ever
    // superseded" semantics must release(), which is what teardown does.
    const own = ownedContinuation({ event: () => event });
    event = 'e2';
    expect(own.stillOwns()).toBe(false);
    event = 'e1';
    expect(own.stillOwns()).toBe(true);
  });

  it('compares by Object.is, so a fresh object each read never owns anything', () => {
    const own = ownedContinuation({ key: () => ({ id: 'k1' }) });
    expect(own.stillOwns()).toBe(false);
    const stable = { id: 'k1' };
    const byReference = ownedContinuation({ key: () => stable });
    expect(byReference.stillOwns()).toBe(true);
  });

  it('reads the getters lazily — a dimension is only sampled when asked', () => {
    const principal = vi.fn(() => 'u1');
    const own = ownedContinuation({ principal });
    expect(principal).toHaveBeenCalledTimes(1); // captured at start
    own.stillOwns();
    expect(principal).toHaveBeenCalledTimes(2);
    own.release();
    own.stillOwns();
    // Released short-circuits: no reason to ask the app anything.
    expect(principal).toHaveBeenCalledTimes(2);
  });

  it('threads a real AbortSignal, so the request stops on the wire too', async () => {
    const own = ownedContinuation({ principal: () => 'u1' });
    const rejected = new Promise((_resolve, reject) => {
      own.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
    });
    own.release();
    await expect(rejected).rejects.toMatchObject({ name: 'AbortError' });
  });
});

