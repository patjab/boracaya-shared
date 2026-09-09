/**
 * True when `e` is a cancellation rather than a failure: the browser's
 * `AbortError`, or the `CancelledError` data.ts throws in its place (which
 * keeps `name = 'AbortError'` so both shapes answer the same question).
 *
 * The predicate consumers use. At every catch that would paint an error state,
 * a toast, or a console line, return early on it — a cancelled read has no
 * outcome to show, because whoever asked for it is already gone.
 */
export declare const isCancelled: (e: unknown) => boolean;
/**
 * Internal to the call primitives: a call whose OWN signal has aborted is
 * cancelled whatever the engine chose to reject with. Not exported to
 * consumers — passing someone else's signal here turns a genuine failure that
 * merely raced the abort into a silent one.
 */
export declare const isCancelledCall: (e: unknown, signal?: AbortSignal) => boolean;
