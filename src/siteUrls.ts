// Inter-site / public website page links — NOT API endpoints (those live in
// ApiConstants). Centralized so no app hardcodes a site URL (cdk#562: two apps
// re-derived these by hand and both linked the wrong environment or the legacy
// domain). Every link minted here rides the boracaya identity — the pdaboracay
// hosts are 301 shells (cdk#500/#502), never link targets — and every host is
// environment-aware via env.ts.
import { envSubdomain } from './env';

// The guest-facing platform site for THIS environment: boracaya.com, or the
// env's own subdomain of it (test.boracaya.com). ENV_SUBDOMAIN is the '.test'
// infix marker; on the bare site it is the leading label instead.
const publicSite = (): string => {
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
export const guestSiteUrlFor = (eventId: string): string =>
    `${SiteUrls.PUBLIC}/e/${encodeURIComponent(eventId)}/`;

/**
 * A guest's personal invite link (cdk#426 contract):
 * `<guest site>/e/{eventId}/?invited={userId}`. Canonical builder — Valet's
 * ApiRouteUtils delegates here (cdk#564: its hand-rolled copy minted prod
 * legacy-domain links from the TEST console).
 */
export const inviteUrlFor = (eventId: string, userId: string): string =>
    `${guestSiteUrlFor(eventId)}?invited=${encodeURIComponent(userId)}`;
