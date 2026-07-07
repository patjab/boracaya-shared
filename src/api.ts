// API endpoints. Each REST API is fronted by a stable per-frontend custom domain
// with an EMPTY base path (e.g. public-api.pdaboracay.com), so the request path
// the Lambda sees stays `/events/…` (no base-path prefix — a base path would be
// left in event.path and break the Lambdas' path-based routing). This keeps the
// volatile execute-api IDs out of the UIs (resolves pda-boracay-cdk#2).
// faces-control is the v2 control API on its own domain. survey / moments(-official)
// / faces box are already stable.
//
// Environment (pda-boracay-cdk #6 testing rollout): the SAME UI bundle serves prod
// and the testing mirror. The target environment is picked at RUNTIME from the
// page hostname — a build served from *.test.pdaboracay.com targets the
// *.test.pdaboracay.com APIs; everything else (prod, and Node/SSR/unit-test where
// `window` is absent) targets prod. One build, no per-bundler build flags.
// NOTE: the 5 *-api.test domains exist; survey/faces/faces-control/moments need a
// test equivalent before those features work under test (else they fail closed —
// test never silently hits prod data).
// A page served from either test host (test.pdaboracay.com or test.boracaya.com,
// cdk#500 rebrand) targets the testing APIs; everything else targets prod.
// The check itself lives in env.ts (pda-boracay#119) so site links share it.
import { isTestEnv } from './env';

// Legacy pdaboracay hosts — still the home of the surfaces that have no boracaya
// twin yet (faces, faces-control, the moments CDN). Everything API-shaped moved
// to boracaya below (cdk#500/#501).
const host = (sub: string): string =>
    `https://${sub}${isTestEnv ? '.test' : ''}.pdaboracay.com`;

// boracaya.com API hosts (cdk#500 rebrand; cdk#501 created them in both envs).
// admin-api is renamed valet-api to match the product. Every UI — including one
// still served from a legacy pdaboracay host during the transition — calls these;
// the API CORS allowlists carry both origins.
const bHost = (sub: string): string =>
    `https://${sub}${isTestEnv ? '.test' : ''}.boracaya.com`;

const PUBLIC_API = bHost('public-api');
const ADMIN_API = bHost('valet-api');
const RESERVATIONS_API = bHost('reservations-api');
const SAVETHEDATE_API = host('savethedate-api');
const SHARE_API = bHost('share-api');
// Moments upload API: prod = share-api.boracaya.com; testing = moments-api.test.boracaya.com
// (no share-api.test host exists). Same lambda either way; only the fronting domain differs.
const UPLOAD_API = isTestEnv ? bHost('moments-api') : SHARE_API;
const FACES_CONTROL_API = host('faces-control');
const FACES_BOX_BASE = host('faces');
const MOMENTS_BASE = host('moments');

export const ApiConstants = {
    // Invites
    GET_ALL_INVITES: `${ADMIN_API}/invite?userId=lakandula`,
    CREATE_INVITES_BY_CSV_UPLOAD: `${ADMIN_API}/scramble`,
    INCREMENT_COUNT_OF_INVITE_SENT: `${ADMIN_API}/scramble/increment`,
    // Admin 'Tag' edit: set invitedBy on an existing invite by userId (#194 2b).
    // Replaces the email-keyed /organize write as guest_organizer is retired.
    SET_INVITED_BY: `${ADMIN_API}/invite`,

    // Guest token exchange (#296 / #100 Phase 1): a ?invited=<userId> link is exchanged
    // here for a short-lived, guest-scoped JWT the reservations calls send as a Bearer.
    // Identity claim + Google-first login (cdk#438/#439, #373 D2–D5): with a userId it
    // reconciles the invite-link identity with a verified Google email (bind/merge);
    // without one it resolves a login by email alone (guided 404 / mint / chooser 409).

    // RSVP — public reservations route is link-read only (?userId=/?email=); the admin
    // console needs the FULL list, which requires admin auth, so it uses the admin-api
    // mirror (same lambda; the admin authorizer supplies isAdmin -> get_all_rsvps).
    GET_ALL_RSVPS: `${ADMIN_API}/rsvp`,

    // Save the date
    GET_SAVE_THE_DATE_RECORDS: `${SAVETHEDATE_API}/records`,
    SAVE_THE_DATE_RECORD: `${SAVETHEDATE_API}/record`,
    GUEST_AUTH: `${SAVETHEDATE_API}/guest?guest=`,

    // Surveys — served by the survey lambda on the managed public-api (#210). The old
    // standalone survey.pdaboracay.com had no test host, so these failed closed on test.

    // IP tracking (admin API root)
    GET_IP_ADDRESSES: `${ADMIN_API}`,

    // Admin auth
    LOGIN: `${ADMIN_API}/login`,

    // Admin events config
    ADMIN_EVENTS: `${ADMIN_API}/events`,

    // Admin email templates
    TEMPLATES: `${ADMIN_API}/templates`,
    EMAIL_TEMPLATE: `${ADMIN_API}/email-template`,

    // Guestbook wishes

    // Events (dynamic app config)
    EVENTS: `${PUBLIC_API}/events`,
    // The public feed of OPEN (inclusivus) events (cdk#468/#508).
    DISCOVER: `${PUBLIC_API}/discover`,

    // Visit analytics

    // Media upload (share app). Prod serves this on share-api; the testing mirror serves
    // it on moments-api (the share-api.test domain doesn't exist). Pick per-env so guest
    // uploads work under test instead of failing closed on a non-resolving host.

    // Moments gallery
    MOMENTS_ADMIN: `${ADMIN_API}/moments`,

    // Faces — control plane (v2 API on its own stable domain) + box base.
    // FACES_BOX is an EPHEMERAL on-demand instance and is usually off, so it is
    // excluded from live smoke checks (see api.smoke.test.ts).
    FACES_CONTROL: FACES_CONTROL_API,
    FACES_BOX: FACES_BOX_BASE,

    // Moments "Official" gallery — static objects served by CloudFront.
    MOMENTS_OFFICIAL_MANIFEST: `${MOMENTS_BASE}/uploads/official/manifest.json`,
    MOMENTS_OFFICIAL_BOOT: `${MOMENTS_BASE}/uploads/official/_boot.json`,
} as const;

/**
 * Event-scoped admin endpoints (cdk#396 / admin#101): the URL names the TARGET event;
 * the caller's Google ID token plus the server-side membership check authorize it
 * (the shipped About-PUT pattern, generalized). One builder per lane so no consumer
 * ever hand-assembles a path; eventId/templateId/email are URI-encoded here.
 * The flat ApiConstants forms above remain until the Valet migration completes
 * (cdk#405 removes them).
 */
export const AdminEventApi = {
    config: (eventId: string) => `${ADMIN_API}/events/${encodeURIComponent(eventId)}`,
    pagesOrder: (eventId: string) => `${ADMIN_API}/events/${encodeURIComponent(eventId)}/pages/order`,
    about: (eventId: string) => `${ADMIN_API}/events/${encodeURIComponent(eventId)}/about`,
    rsvps: (eventId: string) => `${ADMIN_API}/events/${encodeURIComponent(eventId)}/rsvp`,
    // Composed, preset-resolved roster (cdk#575): the grid's single read — identity
    // (PROFILE) + nested rsvp + per-stage objects; the response's `preset` tells the
    // consumer which vocabulary (invite fields ride exclusivus items only).
    roster: (eventId: string) => `${ADMIN_API}/events/${encodeURIComponent(eventId)}/roster`,
    invites: (eventId: string) => `${ADMIN_API}/events/${encodeURIComponent(eventId)}/invite`,
    // Organizer invitations (cdk#534/#537): POST creates + emails an invite.
    // Plural /invites = the organizer lifecycle; singular /invite = guest lane.
    organizerInvites: (eventId: string) => `${ADMIN_API}/events/${encodeURIComponent(eventId)}/invites`,
    scramble: (eventId: string) => `${ADMIN_API}/events/${encodeURIComponent(eventId)}/scramble`,
    scrambleIncrement: (eventId: string) => `${ADMIN_API}/events/${encodeURIComponent(eventId)}/scramble/increment`,
    // Custom-stage definitions + the responses grid (cdk#466/#513).
    stages: (eventId: string) => `${ADMIN_API}/events/${encodeURIComponent(eventId)}/stages`,
    stage: (eventId: string, stageId: string) =>
        `${ADMIN_API}/events/${encodeURIComponent(eventId)}/stages/${encodeURIComponent(stageId)}`,
    stageResponses: (eventId: string, stageId: string) =>
        `${ADMIN_API}/events/${encodeURIComponent(eventId)}/stages/${encodeURIComponent(stageId)}/responses`,
    // Admin merge-write on ONE guest's stage response (cdk#529) - the room-block
    // lane (the bespoke precheckin routes retired with cdk#529).
    stageResponse: (eventId: string, stageId: string, userId: string) =>
        `${ADMIN_API}/events/${encodeURIComponent(eventId)}/stages/${encodeURIComponent(stageId)}/responses/${encodeURIComponent(userId)}`,
    /** Organizer asset-upload presign (cdk#394): admin-authorized, tenant-prefixed key. */
    assets: (eventId: string) => `${ADMIN_API}/events/${encodeURIComponent(eventId)}/assets`,
    moments: (eventId: string) => `${ADMIN_API}/events/${encodeURIComponent(eventId)}/moments`,
    momentsPublic: (eventId: string) => `${ADMIN_API}/events/${encodeURIComponent(eventId)}/moments/public`,
    templates: (eventId: string) => `${ADMIN_API}/events/${encodeURIComponent(eventId)}/templates`,
    template: (eventId: string, templateId: string) =>
        `${ADMIN_API}/events/${encodeURIComponent(eventId)}/templates/${encodeURIComponent(templateId)}`,
    emailTemplate: (eventId: string) => `${ADMIN_API}/events/${encodeURIComponent(eventId)}/email-template`,
    surveys: (eventId: string) => `${ADMIN_API}/events/${encodeURIComponent(eventId)}/surveys`,
    surveyCounts: (eventId: string) => `${ADMIN_API}/events/${encodeURIComponent(eventId)}/surveys/count`,
} as const;

/**
 * Account/registration lane (cdk#387, decision cdk#464): identity-level admin-api
 * endpoints — the caller is any VERIFIED Google identity, membership NOT required
 * (the identity authorizer verifies the token; the handlers do the rest).
 * `me` is Valet's post-login probe ({registered, email, events: [...]}) — a
 * zero-membership sign-in gets a 200 with an empty list instead of the pre-#387
 * 403 dead end. `register` idempotently upserts the caller's account (PROFILE row
 * in the memberships table); Valet auto-calls it when `me` reports no account.
 */
export const AccountApi = {
    me: `${ADMIN_API}/accounts/me`,
    register: `${ADMIN_API}/accounts`,
} as const;

/**
 * Event-scoped GUEST + public endpoints (cdk#427 / #386 SI-5): the URL names the
 * TARGET event — the guest SPA's path-prefix tenant (cdk#447) reaches the API as a
 * path segment, never a server-pinned default. The guest-authed lanes
 * (rsvp/stages/uploads) are additionally validated server-side: the token's
 * guest must have a PROFILE row in the path event (fail closed). The public lanes
 * (auth/invite/moments-public/wishes/survey) take the path event directly.
 * The flat ApiConstants forms above remain until the cdk#427 contract step deletes
 * the flat routes.
 */
export const GuestEventApi = {
    // Open entry (cdk#468/#508): the invite-less quick RSVP for OPEN events.
    openRsvp: (eventId: string) => `${PUBLIC_API}/events/${encodeURIComponent(eventId)}/rsvp/open`,
    exchange: (eventId: string) => `${PUBLIC_API}/events/${encodeURIComponent(eventId)}/auth/exchange`,
    claim: (eventId: string) => `${PUBLIC_API}/events/${encodeURIComponent(eventId)}/auth/claim`,
    invite: (eventId: string) => `${PUBLIC_API}/events/${encodeURIComponent(eventId)}/invite`,
    momentsPublic: (eventId: string) => `${PUBLIC_API}/events/${encodeURIComponent(eventId)}/moments/public`,
    wishes: (eventId: string) => `${PUBLIC_API}/events/${encodeURIComponent(eventId)}/wishes`,
    survey: (eventId: string) => `${PUBLIC_API}/events/${encodeURIComponent(eventId)}/survey`,
    rsvp: (eventId: string) => `${RESERVATIONS_API}/events/${encodeURIComponent(eventId)}/rsvp`,
    // The guest's own custom-stage submission (cdk#466/#513).
    stage: (eventId: string, stageId: string) =>
        `${RESERVATIONS_API}/events/${encodeURIComponent(eventId)}/stages/${encodeURIComponent(stageId)}`,
    initiateUpload: (eventId: string) => `${UPLOAD_API}/events/${encodeURIComponent(eventId)}/initiate`,
    completeUpload: (eventId: string) => `${UPLOAD_API}/events/${encodeURIComponent(eventId)}/complete`,
} as const;

