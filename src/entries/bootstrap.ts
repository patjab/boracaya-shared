/**
 * Shore's initial application seam: environment-aware public endpoints, reads,
 * event/shell contracts, and site links. It intentionally excludes admin
 * clients, shared form UI, and React hooks.
 */
export { PublicApi, GuestEventApi } from '../publicApi';
export { ApiError, CancelledError, getJson, isCancelled, jsonOr, sendJson } from '../data';
// #166: the ownership helper belongs on the same seam as the calls it guards —
// Shore's src reaches the data lane through this entry and nowhere else, so
// leaving it off would have meant every guarded site there importing around
// the seam. Zero-import module, so it costs no bundle to a consumer that
// never names it.
export { ownedContinuation } from '../ownedContinuation';
export type { ContinuationOwner, OwnedContinuation } from '../ownedContinuation';
export type { CallOptions, SendOptions } from '../data';
export { addBreadcrumb, flushReports, initReporter, leavePage, report } from '../report';
export type { ReportContext, ReporterConfig } from '../report';
export { getEnv, isTest, envSubdomain } from '../env';
export type { EnvName } from '../env';
export { SiteUrls, guestSiteUrlFor, inviteUrlFor, invitationUrlFor } from '../siteUrls';
export {
  CURATED_DESIGNS,
  FALLBACK_DEFAULTS,
  OCCASION_DEFAULTS,
  SHELL_KEYS,
  TYPE_VOICES,
  isShellKey,
} from '../shells';
export type { PublicEventMetadata } from '../event';
export type {
  CuratedDesignId,
  OccasionKey,
  ShellKey,
  StyleConfig,
  TypeVoice,
} from '../shells';
