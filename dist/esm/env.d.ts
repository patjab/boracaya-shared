export type EnvName = 'PROD' | 'TEST';
/** The page's environment, resolved from the current hostname on every call. */
export declare const getEnv: () => EnvName;
/** Convenience predicate — prefer getEnv() when branching on more than a boolean. */
export declare const isTest: () => boolean;
export declare const envSubdomain: () => string;
