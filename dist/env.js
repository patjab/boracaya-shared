"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.ENV_SUBDOMAIN = exports.isTestEnv = exports.ENV = void 0;
// Ordered hostname→environment rules. First match wins; no match — prod pages,
// and Node/SSR/unit-test where `window` is absent — resolves PROD. A rule
// matches its host and any subdomain of it (e.g. www.test.pdaboracay.com).
// Onboarding a future environment (DEV, AUTO_QA, …) = one row here + its
// subdomain marker in ENV_SUBDOMAIN below; nothing else re-derives hosts.
const HOST_RULES = [
    { pattern: /(^|\.)test\.(pdaboracay|boracaya)\.com$/, env: 'TEST' },
];
const resolveEnv = () => {
    var _a, _b;
    if (typeof window === 'undefined')
        return 'PROD';
    const hostname = window.location.hostname;
    return (_b = (_a = HOST_RULES.find((r) => r.pattern.test(hostname))) === null || _a === void 0 ? void 0 : _a.env) !== null && _b !== void 0 ? _b : 'PROD';
};
/** The page's environment, resolved once at module load (the hostname cannot
 *  change without a full navigation). */
exports.ENV = resolveEnv();
/** Legacy boolean — prefer ENV in new code. */
exports.isTestEnv = exports.ENV === 'TEST';
// The per-environment subdomain marker on platform hosts — e.g.
// `valet${ENV_SUBDOMAIN}.boracaya.com`. Keyed by EnvName so onboarding a
// future environment is exactly two visible edits: its HOST_RULES row and
// its marker here (the compiler enforces the second once the union grows).
const SUBDOMAIN_BY_ENV = {
    PROD: '',
    TEST: '.test',
};
exports.ENV_SUBDOMAIN = SUBDOMAIN_BY_ENV[exports.ENV];
