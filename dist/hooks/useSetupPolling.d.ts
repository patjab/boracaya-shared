/**
 * The fresh-event wait cadence (#878): re-poll the caller's reload on a short
 * interval and hand over the screen the moment the config lands; only after
 * the cap does the notice ask the host to act.
 */
export declare const useSetupPolling: ({ reload, maxAttempts, intervalMs }: {
    reload: () => void | Promise<unknown>;
    maxAttempts: number;
    intervalMs: number;
}) => {
    exhausted: boolean;
    checkAgain: () => void;
};
