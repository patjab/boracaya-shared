export declare const useApi: <T>(url: string, defaultOptions?: RequestInit) => {
    execute: (overrideOptions?: RequestInit) => Promise<T>;
    data: T | null;
    isLoading: boolean;
    error: string | null;
};
