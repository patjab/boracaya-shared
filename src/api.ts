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
const isTestEnv =
    typeof window !== 'undefined' &&
    /(^|\.)test\.pdaboracay\.com$/.test(window.location.hostname);

const host = (sub: string): string =>
    `https://${sub}${isTestEnv ? '.test' : ''}.pdaboracay.com`;

const PUBLIC_API = host('public-api');
const ADMIN_API = host('admin-api');
const RESERVATIONS_API = host('reservations-api');
const SAVETHEDATE_API = host('savethedate-api');
const SHARE_API = host('share-api');
// Moments upload API: prod = share-api.pdaboracay.com; testing = moments-api.test.pdaboracay.com
// (no share-api.test host exists). Same lambda either way; only the fronting domain differs.
const UPLOAD_API = isTestEnv ? host('moments-api') : SHARE_API;
const FACES_CONTROL_API = host('faces-control');
const FACES_BOX_BASE = host('faces');
const MOMENTS_BASE = host('moments');

export const ApiConstants = {
    // Invites
    GET_ALL_INVITES: `${ADMIN_API}/invite?userId=lakandula`,
    GET_INVITE: `${PUBLIC_API}/invite`,
    CREATE_INVITES_BY_CSV_UPLOAD: `${ADMIN_API}/scramble`,
    INCREMENT_COUNT_OF_INVITE_SENT: `${ADMIN_API}/scramble/increment`,
    // Admin 'Tag' edit: set invitedBy on an existing invite by userId (#194 2b).
    // Replaces the email-keyed /organize write as guest_organizer is retired.
    SET_INVITED_BY: `${ADMIN_API}/invite`,

    // Guest token exchange (#296 / #100 Phase 1): a ?invited=<userId> link is exchanged
    // here for a short-lived, guest-scoped JWT the reservations calls send as a Bearer.
    AUTH_EXCHANGE: `${PUBLIC_API}/auth/exchange`,

    // RSVP — public reservations route is link-read only (?userId=/?email=); the admin
    // console needs the FULL list, which requires admin auth, so it uses the admin-api
    // mirror (same lambda; the admin authorizer supplies isAdmin -> get_all_rsvps).
    GET_RSVPS: `${RESERVATIONS_API}/rsvp`,
    GET_ALL_RSVPS: `${ADMIN_API}/rsvp`,

    // Pre-checkins — public reservations route for guest link reads + the shangrila POST;
    // admin-api mirror for the admin console's full-list read (admin-authed).
    GET_PRECHECKINS: `${RESERVATIONS_API}/pda-boracay-precheckins`,
    GET_ALL_PRECHECKINS: `${ADMIN_API}/pda-boracay-precheckins`,

    // Save the date
    GET_SAVE_THE_DATE_RECORDS: `${SAVETHEDATE_API}/records`,
    SAVE_THE_DATE_RECORD: `${SAVETHEDATE_API}/record`,
    GUEST_AUTH: `${SAVETHEDATE_API}/guest?guest=`,

    // Surveys — served by the survey lambda on the managed public-api (#210). The old
    // standalone survey.pdaboracay.com had no test host, so these failed closed on test.
    GET_ALL_SURVEYS: `${PUBLIC_API}/surveys`,
    GET_SURVEY_COUNTS: `${PUBLIC_API}/surveys/count`,

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
    WISHES: `${PUBLIC_API}/wishes`,

    // Events (dynamic app config)
    EVENTS: `${PUBLIC_API}/events`,

    // Visit analytics
    SURVEY: `${PUBLIC_API}/survey`,

    // Media upload (share app). Prod serves this on share-api; the testing mirror serves
    // it on moments-api (the share-api.test domain doesn't exist). Pick per-env so guest
    // uploads work under test instead of failing closed on a non-resolving host.
    INITIATE_UPLOAD: `${UPLOAD_API}/initiate`,
    COMPLETE_UPLOAD: `${UPLOAD_API}/complete`,

    // Moments gallery
    MOMENTS_ADMIN: `${ADMIN_API}/moments`,
    MOMENTS_PUBLIC: `${PUBLIC_API}/moments/public`,

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
    invites: (eventId: string) => `${ADMIN_API}/events/${encodeURIComponent(eventId)}/invite`,
    scramble: (eventId: string) => `${ADMIN_API}/events/${encodeURIComponent(eventId)}/scramble`,
    scrambleIncrement: (eventId: string) => `${ADMIN_API}/events/${encodeURIComponent(eventId)}/scramble/increment`,
    precheckins: (eventId: string) => `${ADMIN_API}/events/${encodeURIComponent(eventId)}/precheckins`,
    precheckinByEmail: (eventId: string, email: string) =>
        `${ADMIN_API}/events/${encodeURIComponent(eventId)}/precheckins/${encodeURIComponent(email)}`,
    moments: (eventId: string) => `${ADMIN_API}/events/${encodeURIComponent(eventId)}/moments`,
    momentsPublic: (eventId: string) => `${ADMIN_API}/events/${encodeURIComponent(eventId)}/moments/public`,
    templates: (eventId: string) => `${ADMIN_API}/events/${encodeURIComponent(eventId)}/templates`,
    template: (eventId: string, templateId: string) =>
        `${ADMIN_API}/events/${encodeURIComponent(eventId)}/templates/${encodeURIComponent(templateId)}`,
    emailTemplate: (eventId: string) => `${ADMIN_API}/events/${encodeURIComponent(eventId)}/email-template`,
    surveys: (eventId: string) => `${ADMIN_API}/events/${encodeURIComponent(eventId)}/surveys`,
    surveyCounts: (eventId: string) => `${ADMIN_API}/events/${encodeURIComponent(eventId)}/surveys/count`,
} as const;

