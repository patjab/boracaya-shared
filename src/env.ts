// Runtime environment detection (pda-boracay-cdk #6 testing rollout): the SAME
// UI bundle serves prod and the testing mirror, so the environment is picked at
// RUNTIME from the page hostname — no per-bundler build flags. A page whose
// hostname is either test host (test.pdaboracay.com or test.boracaya.com,
// cdk#500 rebrand) OR any subdomain of one (e.g. www.test.pdaboracay.com) is
// the testing environment; everything else — prod, and Node/SSR/unit-test
// where `window` is absent — resolves prod.
//
// This is THE environment check (extracted from api.ts for pda-boracay#119,
// where a hand-rolled copy in an app repo missed the rebranded test host and a
// test page linked prod). Consumers should use the derived constants
// (ApiConstants, SiteUrls, …) rather than re-deriving hosts from this flag.
export const isTestEnv: boolean =
    typeof window !== 'undefined' &&
    /(^|\.)test\.(pdaboracay|boracaya)\.com$/.test(window.location.hostname);
