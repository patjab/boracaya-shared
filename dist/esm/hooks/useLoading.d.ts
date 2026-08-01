export declare const useLoading: () => {
    isLoading: boolean;
    withLoading: <T>(fn: () => Promise<T>) => Promise<T>;
};
