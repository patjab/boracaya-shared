import { useState, useCallback } from 'react';
import { authHeaders } from '../auth';

type ApiState<T> = {
    data: T | null;
    isLoading: boolean;
    error: string | null;
};

export const useApi = <T>(url: string, defaultOptions?: RequestInit) => {
    const [state, setState] = useState<ApiState<T>>({ data: null, isLoading: false, error: null });

    const execute = useCallback(async (overrideOptions?: RequestInit): Promise<T> => {
        setState(s => ({ ...s, isLoading: true, error: null }));
        try {
            // Attach the Cognito ID token (when signed in) so gated endpoints accept
            // the call; callers can still override any header. #161.
            const response = await fetch(url, {
                ...defaultOptions,
                ...overrideOptions,
                headers: { ...authHeaders(), ...defaultOptions?.headers, ...overrideOptions?.headers },
            });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const data = await response.json() as T;
            setState({ data, isLoading: false, error: null });
            return data;
        } catch (err) {
            const error = err instanceof Error ? err.message : String(err);
            setState(s => ({ ...s, isLoading: false, error }));
            throw err;
        }
    }, [url]);

    return { ...state, execute };
};
