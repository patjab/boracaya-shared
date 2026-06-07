export declare const useApi: <T>(url: string, defaultOptions?: RequestInit) => {
    data: T | null;
    isLoading: boolean;
    error: string | null;
    execute: (overrideOptions?: RequestInit) => Promise<T>;
};
