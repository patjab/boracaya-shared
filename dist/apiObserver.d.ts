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
/** Install (or, with null, remove) the observer. The reporter is the only caller. */
export declare const observeApiCalls: (o: ApiObserver | null) => void;
export declare const apiFailed: (f: ApiFailure) => void;
export declare const apiSucceeded: (method: string, url: string, status: number) => void;
export declare const apiCaught: (label: string, e: unknown) => void;
