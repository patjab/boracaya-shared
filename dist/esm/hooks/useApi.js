import { useState, useCallback } from 'react';
import { authHeaders } from '../auth.js';
export const useApi = (url, defaultOptions) => {
    const [state, setState] = useState({ data: null, isLoading: false, error: null });
    const execute = useCallback(async (overrideOptions) => {
        setState(s => ({ ...s, isLoading: true, error: null }));
        try {
            // Attach the Cognito ID token (when signed in) so gated endpoints accept
            // the call; callers can still override any header. #161.
            const response = await fetch(url, {
                ...defaultOptions,
                ...overrideOptions,
                headers: { ...authHeaders(), ...defaultOptions === null || defaultOptions === void 0 ? void 0 : defaultOptions.headers, ...overrideOptions === null || overrideOptions === void 0 ? void 0 : overrideOptions.headers },
            });
            if (!response.ok)
                throw new Error(`HTTP ${response.status}`);
            const data = await response.json();
            setState({ data, isLoading: false, error: null });
            return data;
        }
        catch (err) {
            const error = err instanceof Error ? err.message : String(err);
            setState(s => ({ ...s, isLoading: false, error }));
            throw err;
        }
    }, [url]);
    return { ...state, execute };
};
