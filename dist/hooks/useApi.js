"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.useApi = void 0;
const react_1 = require("react");
const useApi = (url, defaultOptions) => {
    const [state, setState] = (0, react_1.useState)({ data: null, isLoading: false, error: null });
    const execute = (0, react_1.useCallback)(async (overrideOptions) => {
        setState(s => ({ ...s, isLoading: true, error: null }));
        try {
            const response = await fetch(url, { ...defaultOptions, ...overrideOptions });
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
exports.useApi = useApi;
