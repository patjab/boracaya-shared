export declare const SiteUrls: {
    readonly PUBLIC: string;
    readonly EVENTS_PAGE: string;
    readonly VALET: string;
};
/**
 * The event's canonical guest URL (cdk#386: path prefix + raw uuid, no slugs).
 * The guest SPA reads its tenant from the `/e/{eventId}/` path prefix — the
 * path is the ONLY tenant source (cdk#447). Encode the segment: eventIds are
 * UUIDs today, but never interpolate an identity into a URL raw.
 */
export declare const guestSiteUrlFor: (eventId: string) => string;
/**
 * A guest's personal invite link (cdk#426 contract):
 * `<guest site>/e/{eventId}/?invited={userId}`. Canonical builder — Valet's
 * ApiRouteUtils delegates here (cdk#564: its hand-rolled copy minted prod
 * legacy-domain links from the TEST console).
 */
export declare const inviteUrlFor: (eventId: string, userId: string) => string;
/**
 * A guest's personal invite link, cdk#1566 form:
 * `<guest site>/e/{eventId}/?invite={invitationToken}`.
 *
 * Replaces `inviteUrlFor` above, whose `?invited={userId}` handed out the
 * guest's INTERNAL identifier as a permanent, unrevocable credential. The token
 * is event-scoped and revocable, and only its hash is ever stored — which is
 * why ONLY the server can mint one of these links, at the moment it issues the
 * token. Nothing can rebuild a guest's link later, including this function:
 * pass the raw token you were just handed, or re-issue.
 */
export declare const invitationUrlFor: (eventId: string, invitationToken: string) => string;
