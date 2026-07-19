// Runtime environment detection (pda-boracay-cdk #6 testing rollout): the SAME
// UI bundle serves every environment, so the environment is picked at RUNTIME
// from the page hostname — no per-bundler build flags.
//
// This is THE environment check (extracted from api.ts for pda-boracay#119,
// where a hand-rolled copy in an app repo missed the rebranded test host and a
// test page linked prod; grown into a named-env hostmap for cdk#562/#563,
// where a second hand-rolled copy in Valet did the same for invite links).
// Consumers should use the derived constants (ApiConstants, SiteUrls, …)
// rather than re-deriving hosts from these exports.
//
// Resolution is PER CALL, not at module load (shared#95 / cdk#1107): a
// module-load window read froze the environment into whichever hostname the
// first import saw — impossible to exercise per-hostname in tests without
// re-importing the whole module graph, and hostile to any non-browser
// consumer. The check is one regex over location.hostname; there is nothing
// worth caching, and the hostname cannot change without a full navigation.

export type EnvName = 'PROD' | 'TEST';

// Ordered hostname→environment rules. First match wins; no match — prod pages,
// and Node/SSR/unit-test where `window` is absent — resolves PROD. A rule
// matches its host and any subdomain of it (e.g. www.test.pdaboracay.com).
// Onboarding a future environment (DEV, AUTO_QA, …) = one row here + its
// subdomain marker in SUBDOMAIN_BY_ENV below; nothing else re-derives hosts.
const HOST_RULES: ReadonlyArray<{ pattern: RegExp; env: EnvName }> = [
    { pattern: /(^|\.)test\.(pdaboracay|boracaya)\.com$/, env: 'TEST' },
];

/** The page's environment, resolved from the current hostname on every call. */
export const getEnv = (): EnvName => {
    if (typeof window === 'undefined') return 'PROD';
    const hostname = window.location.hostname;
    return HOST_RULES.find((r) => r.pattern.test(hostname))?.env ?? 'PROD';
};

/** Convenience predicate — prefer getEnv() when branching on more than a boolean. */
export const isTest = (): boolean => getEnv() === 'TEST';

// The per-environment subdomain marker on platform hosts — e.g.
// `valet${envSubdomain()}.boracaya.com`. Keyed by EnvName so onboarding a
// future environment is exactly two visible edits: its HOST_RULES row and
// its marker here (the compiler enforces the second once the union grows).
const SUBDOMAIN_BY_ENV: Record<EnvName, string> = {
    PROD: '',
    TEST: '.test',
};

export const envSubdomain = (): string => SUBDOMAIN_BY_ENV[getEnv()];
