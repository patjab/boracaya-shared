/**
 * Shore's initial application seam: environment-aware public endpoints, reads,
 * event/shell contracts, and site links. It intentionally excludes admin
 * clients, shared form UI, and React hooks.
 */
export { PublicApi, GuestEventApi } from '../publicApi.js';
export { ApiError, CancelledError, getJson, isCancelled, jsonOr, sendJson } from '../data.js';
// #166: the ownership helper belongs on the same seam as the calls it guards —
// Shore's src reaches the data lane through this entry and nowhere else, so
// leaving it off would have meant every guarded site there importing around
// the seam. Zero-import module, so it costs no bundle to a consumer that
// never names it.
export { ownedContinuation } from '../ownedContinuation.js';
export { addBreadcrumb, flushReports, initReporter, leavePage, report } from '../report.js';
export { getEnv, isTest, envSubdomain } from '../env.js';
export { SiteUrls, guestSiteUrlFor, invitationUrlFor } from '../siteUrls.js';
export { CURATED_DESIGNS, FALLBACK_DEFAULTS, OCCASION_DEFAULTS, SHELL_KEYS, TYPE_VOICES, isShellKey, } from '../shells.js';
