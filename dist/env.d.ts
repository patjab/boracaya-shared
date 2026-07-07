export type EnvName = 'PROD' | 'TEST';
/** The page's environment, resolved once at module load (the hostname cannot
 *  change without a full navigation). */
export declare const ENV: EnvName;
/** Legacy boolean — prefer ENV in new code. */
export declare const isTestEnv: boolean;
export declare const ENV_SUBDOMAIN: string;
