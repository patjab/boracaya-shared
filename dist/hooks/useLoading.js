"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.useLoading = void 0;
const react_1 = require("react");
const useLoading = () => {
    const [isLoading, setIsLoading] = (0, react_1.useState)(false);
    const withLoading = (0, react_1.useCallback)(async (fn) => {
        setIsLoading(true);
        try {
            return await fn();
        }
        finally {
            setIsLoading(false);
        }
    }, []);
    return { isLoading, withLoading };
};
exports.useLoading = useLoading;
