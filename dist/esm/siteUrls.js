// Inter-site / public website page links — NOT API endpoints (those live in
// ApiConstants). Centralized so no app hardcodes a site URL (cdk#562: two apps
// re-derived these by hand and both linked the wrong environment or the legacy
// domain). Every link minted here rides the boracaya identity — the pdaboracay
// hosts are 301 shells (cdk#500/#502), never link targets — and every host is
// environment-aware via env.ts.
import { envSubdomain } from './env.js';
// The guest-facing platform site for THIS environment: boracaya.com, or the
// env's own subdomain of it (test.boracaya.com). ENV_SUBDOMAIN is the '.test'
// infix marker; on the bare site it is the leading label instead.
const publicSite = () => {
    const sub = envSubdomain();
    return sub ? `https://${sub.slice(1)}.boracaya.com` : 'https://boracaya.com';
};
export const SiteUrls = {
    get PUBLIC() { return publicSite(); },
    get EVENTS_PAGE() { return `${publicSite()}/events`; },
    // The Valet organizer console (pda-boracay#119; hosts are the cdk#500/#501
    // valet.boracaya.com pair, live in both envs).
    get VALET() { return `https://valet${envSubdomain()}.boracaya.com`; },
};
/**
 * The event's canonical guest URL (cdk#386: path prefix + raw uuid, no slugs).
 * The guest SPA reads its tenant from the `/e/{eventId}/` path prefix — the
 * path is the ONLY tenant source (cdk#447). Encode the segment: eventIds are
 * UUIDs today, but never interpolate an identity into a URL raw.
 */
export const guestSiteUrlFor = (eventId) => `${SiteUrls.PUBLIC}/e/${encodeURIComponent(eventId)}/`;
/**
 * A guest's personal invite link, cdk#1566 form:
 * `<guest site>/e/{eventId}/?invite={invitationToken}`.
 *
 * Replaced `inviteUrlFor`, whose `?invited={userId}` handed out the guest's
 * INTERNAL identifier as a permanent, unrevocable credential. That builder is
 * DELETED, not kept as a fallback (cdk#1644): a consumer that can still build
 * the old form will, and every such link dies the day `INVITE_LEGACY_UNTIL`
 * passes. The token is event-scoped and revocable, and only its hash is ever
 * stored — which is why ONLY the server can mint one of these links, at the
 * moment it issues the token. Nothing can rebuild a guest's link later,
 * including this function: pass the raw token you were just handed, or
 * re-issue (the host's console does that through `AdminEventApi.inviteLink`,
 * which answers with the finished URL).
 */
export const invitationUrlFor = (eventId, invitationToken) => `${guestSiteUrlFor(eventId)}?invite=${encodeURIComponent(invitationToken)}`;
