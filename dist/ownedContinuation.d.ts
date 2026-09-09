/**
 * The dimensions a continuation can belong to. Each is a GETTER read twice:
 * once when the continuation is created, once when it asks whether it still
 * owns its write.
 *
 * Supply the ones that matter for the call. Omitting a dimension says this work
 * does not belong to it — not that it always matches.
 *
 * Return primitives. Comparison is `Object.is`, so a getter that builds a fresh
 * object each call never owns anything, and one that returns a mutable object
 * always does. Ids, auth generations and counters are the intended shapes.
 */
export interface ContinuationOwner {
    /** Who the work is for: a userId, an auth generation, or both combined. */
    readonly principal?: () => unknown;
    /** Which event/tenant it belongs to. */
    readonly event?: () => unknown;
    /** Which target inside that: a field id, an album, a draft key. */
    readonly key?: () => unknown;
}
export interface OwnedContinuation {
    /**
     * Cancels when `release()` is called. Thread it into the request so the work
     * stops on the wire, not merely on arrival — `stillOwns()` is the guard for
     * a response that arrives anyway, which is the common case for anything the
     * engine has already dispatched.
     */
    readonly signal: AbortSignal;
    /**
     * True while every supplied dimension still reads as it did at the start,
     * and the continuation has not been released.
     *
     * **This answers "may I write", not "should I stop rendering".** A caller
     * that returns early on `false` and does nothing else is correct only when
     * something ELSE owns the transition — a newer request, or an unmounted
     * screen. When neither is true, the caller still has a spinner to clear, and
     * an early return strands it. That mistake is worth naming here because it
     * was made in this repo's own cache during #167: silence was implemented as
     * "return", and the reader who never left was left loading forever.
     */
    stillOwns(): boolean;
    /**
     * Give up ownership and abort the signal. Idempotent. Call it from teardown
     * — an unmount, a key switch, a sign-out — so the request stops and any
     * continuation already queued declines to write.
     */
    release(): void;
}
/**
 * Capture the current owner of some about-to-start async work.
 *
 * ```ts
 * const own = ownedContinuation({ principal: () => session.userId, event: () => eventId });
 * const rows = await getJson(url, { signal: own.signal });
 * if (!own.stillOwns()) return;   // the account or the event changed under us
 * setRows(rows);
 * ```
 */
export declare const ownedContinuation: (owner: ContinuationOwner) => OwnedContinuation;
