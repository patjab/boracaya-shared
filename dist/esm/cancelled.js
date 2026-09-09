// Cancellation, told apart from failure (#167).
//
// When the app cancels its own request — leaving a screen, switching event, a
// newer read superseding an older one — the engine rejects the fetch with an
// AbortError. Every consumer that paints an error state or a toast used to see
// that as a network error, so the host was shown "network error (The user
// aborted a request.)" for having navigated away, and the nightly triage filed
// the same cancelled read twice (cdk#1510, cdk#1539).
//
// This module has NO imports, by design. data.ts throws the cancellation and
// report.ts drops it, and those two must not pull each other into their bundle
// graphs — data.ts and cache.ts stay tiny in the bootstrap graph, and the
// `browser` entry reaches report.ts without wanting data.ts (the fixtures in
// scripts/check-consumer-exports.mjs gate both). A predicate with no
// dependencies can sit under both.
//
// By NAME rather than `instanceof DOMException`: a DOMException from another
// realm (an iframe, jsdom) fails the instanceof, and that miss is precisely
// how a cancellation used to reach the reporter.
/**
 * True when `e` is a cancellation rather than a failure: the browser's
 * `AbortError`, or the `CancelledError` data.ts throws in its place (which
 * keeps `name = 'AbortError'` so both shapes answer the same question).
 *
 * The predicate consumers use. At every catch that would paint an error state,
 * a toast, or a console line, return early on it — a cancelled read has no
 * outcome to show, because whoever asked for it is already gone.
 */
export const isCancelled = (e) => {
    const o = e;
    return (o === null || o === void 0 ? void 0 : o.name) === 'AbortError' || (o === null || o === void 0 ? void 0 : o.cancelled) === true;
};
/**
 * Internal to the call primitives: a call whose OWN signal has aborted is
 * cancelled whatever the engine chose to reject with. Not exported to
 * consumers — passing someone else's signal here turns a genuine failure that
 * merely raced the abort into a silent one.
 */
export const isCancelledCall = (e, signal) => (signal === null || signal === void 0 ? void 0 : signal.aborted) === true || isCancelled(e);
