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
const SURVEY_API = host('survey');
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

    // RSVP
    GET_RSVPS: `${RESERVATIONS_API}/rsvp`,

    // Organizer / admin data
    GET_AND_PUT_ADMIN_ADDED_DATA_TO_RSVPS: `${RESERVATIONS_API}/organize`,

    // Pre-checkins (reservations)
    GET_PRECHECKINS: `${RESERVATIONS_API}/pda-boracay-precheckins`,

    // OTP login (reservations)
    SEND_CODE: `${RESERVATIONS_API}/send-code`,
    VERIFY_CODE: `${RESERVATIONS_API}/verify-code`,

    // Save the date
    GET_SAVE_THE_DATE_RECORDS: `${SAVETHEDATE_API}/records`,
    SAVE_THE_DATE_RECORD: `${SAVETHEDATE_API}/record`,
    GUEST_AUTH: `${SAVETHEDATE_API}/guest?guest=`,

    // Surveys (survey app — already on its own stable domain)
    GET_ALL_SURVEYS: `${SURVEY_API}/surveys`,
    GET_SURVEY_COUNTS: `${SURVEY_API}/surveys/count`,

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

    // Media upload (share app)
    INITIATE_UPLOAD: `${SHARE_API}/initiate`,
    COMPLETE_UPLOAD: `${SHARE_API}/complete`,

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
