import { useState, useCallback } from 'react';

export const useLoading = () => {
    const [isLoading, setIsLoading] = useState(false);

    const withLoading = useCallback(async <T>(fn: () => Promise<T>): Promise<T> => {
        setIsLoading(true);
        try {
            return await fn();
        } finally {
            setIsLoading(false);
        }
    }, []);

    return { isLoading, withLoading };
};
