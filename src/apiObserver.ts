// The seam between the data layer and the client error reporter (cdk#1495).
//
// data.ts and cache.ts must stay tiny in the bootstrap graph (the consumer
// fixtures gate it: scripts/check-consumer-exports.mjs), so they do not import
// the reporter. They tell THIS module what happened; the reporter registers
// itself here when the app calls `initReporter`, and until then every call is
// a no-op. No imports, by design — anything that imports this stays small.

export interface ApiFailure {
  label: string;
  message: string;
  status?: number;
  method: string;
  url: string;
  /** `x-amzn-RequestId` of the failing response — the join key to backend logs. */
  requestId?: string;
  durationMs: number;
}

export interface ApiObserver {
  /** A call primitive raised an ApiError. */
  failure(f: ApiFailure): void;
  /** A call primitive resolved. */
  success(method: string, url: string, status: number): void;
  /** A swallow site caught something that was NOT an ApiError (already reported). */
  caught(label: string, e: unknown): void;
}

let observer: ApiObserver | null = null;

/** Install (or, with null, remove) the observer. The reporter is the only caller. */
export const observeApiCalls = (o: ApiObserver | null): void => {
  observer = o;
};

export const apiFailed = (f: ApiFailure): void => observer?.failure(f);
export const apiSucceeded = (method: string, url: string, status: number): void =>
  observer?.success(method, url, status);
export const apiCaught = (label: string, e: unknown): void => observer?.caught(label, e);
