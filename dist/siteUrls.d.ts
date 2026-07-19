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
