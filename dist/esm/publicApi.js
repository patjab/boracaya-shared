// Shore-facing API endpoints live in their own module so both ESM and CommonJS
// consumers can load the public/guest surface without retaining Valet's admin
// endpoints. Environment selection remains per call through the shared env seam.
import { isTest } from './env.js';
const legacyHost = (subdomain) => `https://${subdomain}${isTest() ? '.test' : ''}.pdaboracay.com`;
const boracayaHost = (subdomain) => `https://${subdomain}${isTest() ? '.test' : ''}.boracaya.com`;
const publicApi = () => boracayaHost('public-api');
const reservationsApi = () => boracayaHost('reservations-api');
const shareApi = () => boracayaHost('share-api');
// Prod uploads use share-api; testing has a dedicated moments-api host.
const uploadApi = () => (isTest() ? boracayaHost('moments-api') : shareApi());
/** Public/bootstrap endpoints used by Shore. */
export const PublicApi = {
    get EVENTS() { return `${publicApi()}/events`; },
    get DISCOVER() { return `${publicApi()}/discover`; },
    get GUEST_LOGIN() { return `${publicApi()}/auth/login`; },
    // Client error telemetry ingest (cdk#1495/#1496): both apps POST report
    // batches here; unauthenticated, WAF + stage-throttled like every public lane.
    get TELEMETRY_ERRORS() { return `${publicApi()}/telemetry/errors`; },
    get FACES_CONTROL() { return legacyHost('faces-control'); },
    get FACES_BOX() { return legacyHost('faces'); },
};
/** Event-scoped guest and public endpoints. */
export const GuestEventApi = {
    openRsvp: (eventId) => `${publicApi()}/events/${encodeURIComponent(eventId)}/rsvp/open`,
    exchange: (eventId) => `${publicApi()}/events/${encodeURIComponent(eventId)}/auth/exchange`,
    claim: (eventId) => `${publicApi()}/events/${encodeURIComponent(eventId)}/auth/claim`,
    unlink: (eventId) => `${publicApi()}/events/${encodeURIComponent(eventId)}/auth/unlink`,
    invite: (eventId) => `${publicApi()}/events/${encodeURIComponent(eventId)}/invite`,
    momentsPublic: (eventId) => `${publicApi()}/events/${encodeURIComponent(eventId)}/moments/public`,
    wishes: (eventId) => `${publicApi()}/events/${encodeURIComponent(eventId)}/wishes`,
    pulse: (eventId) => `${publicApi()}/events/${encodeURIComponent(eventId)}/pulse`,
    pulseMine: (eventId) => `${publicApi()}/events/${encodeURIComponent(eventId)}/pulse/mine`,
    pulsePosts: (eventId) => `${publicApi()}/events/${encodeURIComponent(eventId)}/pulse/posts`,
    pulseVotes: (eventId) => `${publicApi()}/events/${encodeURIComponent(eventId)}/pulse/votes`,
    pulseReactions: (eventId) => `${publicApi()}/events/${encodeURIComponent(eventId)}/pulse/reactions`,
    survey: (eventId) => `${publicApi()}/events/${encodeURIComponent(eventId)}/survey`,
    rsvp: (eventId) => `${reservationsApi()}/events/${encodeURIComponent(eventId)}/rsvp`,
    stage: (eventId, stageId) => `${reservationsApi()}/events/${encodeURIComponent(eventId)}/stages/${encodeURIComponent(stageId)}`,
    initiateUpload: (eventId) => `${uploadApi()}/events/${encodeURIComponent(eventId)}/initiate`,
    completeUpload: (eventId) => `${uploadApi()}/events/${encodeURIComponent(eventId)}/complete`,
};
