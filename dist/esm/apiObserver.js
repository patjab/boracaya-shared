// The seam between the data layer and the client error reporter (cdk#1495).
//
// data.ts and cache.ts must stay tiny in the bootstrap graph (the consumer
// fixtures gate it: scripts/check-consumer-exports.mjs), so they do not import
// the reporter. They tell THIS module what happened; the reporter registers
// itself here when the app calls `initReporter`, and until then every call is
// a no-op. No imports, by design — anything that imports this stays small.
let observer = null;
/** Install (or, with null, remove) the observer. The reporter is the only caller. */
export const observeApiCalls = (o) => {
    observer = o;
};
export const apiFailed = (f) => observer === null || observer === void 0 ? void 0 : observer.failure(f);
export const apiSucceeded = (method, url, status) => observer === null || observer === void 0 ? void 0 : observer.success(method, url, status);
export const apiCaught = (label, e) => observer === null || observer === void 0 ? void 0 : observer.caught(label, e);
