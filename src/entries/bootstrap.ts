/**
 * Shore's initial application seam: environment-aware public endpoints, reads,
 * event/shell contracts, and site links. It intentionally excludes admin
 * clients, shared form UI, and React hooks.
 */
export { PublicApi, GuestEventApi } from '../publicApi';
export { ApiError, getJson, jsonOr, sendJson } from '../data';
export type { CallOptions, SendOptions } from '../data';
export { addBreadcrumb, flushReports, initReporter, report } from '../report';
export type { ReportContext, ReporterConfig } from '../report';
export { getEnv, isTest, envSubdomain } from '../env';
export type { EnvName } from '../env';
export { SiteUrls, guestSiteUrlFor, inviteUrlFor } from '../siteUrls';
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
