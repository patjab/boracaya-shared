"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GuestEventApi = exports.OrganizerInviteApi = exports.FacesApi = exports.AccountApi = exports.AdminEventApi = exports.ApiConstants = void 0;
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
const env_1 = require("./env");
// Legacy pdaboracay hosts — still the home of the surfaces that have no boracaya
// twin yet (faces, faces-control, the moments CDN). Everything API-shaped moved
// to boracaya below (cdk#500/#501).
const host = (sub) => `https://${sub}${env_1.isTestEnv ? '.test' : ''}.pdaboracay.com`;
// boracaya.com API hosts (cdk#500 rebrand; cdk#501 created them in both envs).
// admin-api is renamed valet-api to match the product. Every UI — including one
// still served from a legacy pdaboracay host during the transition — calls these;
// the API CORS allowlists carry both origins.
const bHost = (sub) => `https://${sub}${env_1.isTestEnv ? '.test' : ''}.boracaya.com`;
const PUBLIC_API = bHost('public-api');
const ADMIN_API = bHost('valet-api');
const RESERVATIONS_API = bHost('reservations-api');
const SHARE_API = bHost('share-api');
// Moments upload API: prod = share-api.boracaya.com; testing = moments-api.test.boracaya.com
// (no share-api.test host exists). Same lambda either way; only the fronting domain differs.
const UPLOAD_API = env_1.isTestEnv ? bHost('moments-api') : SHARE_API;
const FACES_CONTROL_API = host('faces-control');
// Face tagging data/API lane (epic cdk#782): the fenced faces REST API — the
// durable half; the GPU box is a client of it, both UIs read it.
const FACES_API = bHost('faces-api');
const FACES_BOX_BASE = host('faces');
const MOMENTS_BASE = host('moments');
exports.ApiConstants = {
    // The flat admin/guest/savethedate constants were REMOVED (shared#57): the routes
    // they named no longer exist server-side — the cdk#427/#405 contract steps made the
    // admin/guest lanes event-scoped, savethedate was decommissioned (#183), and admin
    // auth moved to Google GIS (so /login is gone too). The deleted forms were
    // GET_ALL_INVITES, SET_INVITED_BY, CREATE_INVITES_BY_CSV_UPLOAD (/scramble),
    // INCREMENT_COUNT_OF_INVITE_SENT (/scramble/increment), GET_ALL_RSVPS (/rsvp),
    // LOGIN (/login), TEMPLATES (/templates), EMAIL_TEMPLATE (/email-template),
    // MOMENTS_ADMIN (/moments), and the savethedate GET_SAVE_THE_DATE_RECORDS /
    // SAVE_THE_DATE_RECORD / GUEST_AUTH. Use the event-scoped AdminEventApi /
    // GuestEventApi builders instead.
    // Admin events config (list + create; cdk#464/#472).
    ADMIN_EVENTS: `${ADMIN_API}/events`,
    // Public app-config BASE: consumers build `${EVENTS}/{eventId}/config` and
    // `${EVENTS}/{eventId}/about` off this. The BARE public GET /events (list) was
    // REMOVED (cdk#352), so this base is not itself a live route and is excluded from
    // the live smoke probe (see api.smoke.test.ts). Kept because guest + admin UIs
    // still import it as the base — do NOT remove without updating those consumers.
    EVENTS: `${PUBLIC_API}/events`,
    // The public feed of OPEN (inclusivus) events (cdk#468/#508).
    DISCOVER: `${PUBLIC_API}/discover`,
    // No-event Google login (cdk#623, Option D): an UNSCOPED public route (no
    // eventId path segment) — a server-verified Google credential arriving with no
    // event in the URL is resolved to the event(s) the email is already a member
    // of. Exactly one → the backend mints a guest token + returns that eventId (the
    // SPA redirects into /e/<eventId>/); zero/many → the guided 404. Distinct from
    // GuestEventApi.claim, which requires the target event in its path.
    GUEST_LOGIN: `${PUBLIC_API}/auth/login`,
    // Faces — control plane (v2 API on its own stable domain) + box base.
    // FACES_BOX is an EPHEMERAL on-demand instance and is usually off, so it is
    // excluded from live smoke checks (see api.smoke.test.ts).
    FACES_CONTROL: FACES_CONTROL_API,
    FACES_BOX: FACES_BOX_BASE,
    // Moments "Official" gallery — static objects served by CloudFront.
    MOMENTS_OFFICIAL_MANIFEST: `${MOMENTS_BASE}/uploads/official/manifest.json`,
    MOMENTS_OFFICIAL_BOOT: `${MOMENTS_BASE}/uploads/official/_boot.json`,
};
/**
 * Event-scoped admin endpoints (cdk#396 / admin#101): the URL names the TARGET event;
 * the caller's Google ID token plus the server-side membership check authorize it
 * (the shipped About-PUT pattern, generalized). One builder per lane so no consumer
 * ever hand-assembles a path; eventId/templateId/email are URI-encoded here.
 * The flat ApiConstants forms are GONE (cdk#405 / shared#57) — every admin call
 * rides these event-scoped builders.
 */
exports.AdminEventApi = {
    config: (eventId) => `${ADMIN_API}/events/${encodeURIComponent(eventId)}`,
    about: (eventId) => `${ADMIN_API}/events/${encodeURIComponent(eventId)}/about`,
    rsvps: (eventId) => `${ADMIN_API}/events/${encodeURIComponent(eventId)}/rsvp`,
    // Composed, preset-resolved roster (cdk#575): the grid's single read — identity
    // (PROFILE) + nested rsvp + per-stage objects; the response's `preset` tells the
    // consumer which vocabulary (invite fields ride exclusivus items only).
    roster: (eventId) => `${ADMIN_API}/events/${encodeURIComponent(eventId)}/roster`,
    // Organizer invitations (cdk#534/#537): POST creates + emails an invite.
    // Plural /invites = the organizer lifecycle; singular /invite = guest lane.
    organizerInvites: (eventId) => `${ADMIN_API}/events/${encodeURIComponent(eventId)}/invites`,
    // Who administers the event (cdk#536): [{accountId, email, role, createdAt}].
    members: (eventId) => `${ADMIN_API}/events/${encodeURIComponent(eventId)}/members`,
    // One member's edge (cdk#538: PATCH role / DELETE remove-or-leave).
    // accountId = the NORMALIZED email (no ACCT# prefix in URLs).
    member: (eventId, accountId) => `${ADMIN_API}/events/${encodeURIComponent(eventId)}/members/${encodeURIComponent(accountId)}`,
    // OWNER-gated revoke of a pending organizer invite (cdk#544).
    organizerInvite: (eventId, inviteId) => `${ADMIN_API}/events/${encodeURIComponent(eventId)}/invites/${encodeURIComponent(inviteId)}`,
    scramble: (eventId) => `${ADMIN_API}/events/${encodeURIComponent(eventId)}/scramble`,
    scrambleIncrement: (eventId) => `${ADMIN_API}/events/${encodeURIComponent(eventId)}/scramble/increment`,
    // Custom-stage definitions + the responses grid (cdk#466/#513).
    stages: (eventId) => `${ADMIN_API}/events/${encodeURIComponent(eventId)}/stages`,
    stage: (eventId, stageId) => `${ADMIN_API}/events/${encodeURIComponent(eventId)}/stages/${encodeURIComponent(stageId)}`,
    stageResponses: (eventId, stageId) => `${ADMIN_API}/events/${encodeURIComponent(eventId)}/stages/${encodeURIComponent(stageId)}/responses`,
    // Admin merge-write on ONE guest's stage response (cdk#529) - the room-block
    // lane (the bespoke precheckin routes retired with cdk#529).
    stageResponse: (eventId, stageId, userId) => `${ADMIN_API}/events/${encodeURIComponent(eventId)}/stages/${encodeURIComponent(stageId)}/responses/${encodeURIComponent(userId)}`,
    /** Organizer asset-upload presign (cdk#394): admin-authorized, tenant-prefixed key. */
    assets: (eventId) => `${ADMIN_API}/events/${encodeURIComponent(eventId)}/assets`,
    /** Organizer image unlink (cdk#707): DELETE clears the field + deletes the S3 object. */
    image: (eventId) => `${ADMIN_API}/events/${encodeURIComponent(eventId)}/image`,
    moments: (eventId) => `${ADMIN_API}/events/${encodeURIComponent(eventId)}/moments`,
    momentsPublic: (eventId) => `${ADMIN_API}/events/${encodeURIComponent(eventId)}/moments/public`,
    // Host album uploads (cdk#790): presign, then confirm writes the approved row.
    momentsUpload: (eventId) => `${ADMIN_API}/events/${encodeURIComponent(eventId)}/moments/upload`,
    momentsConfirm: (eventId) => `${ADMIN_API}/events/${encodeURIComponent(eventId)}/moments/confirm`,
    templates: (eventId) => `${ADMIN_API}/events/${encodeURIComponent(eventId)}/templates`,
    template: (eventId, templateId) => `${ADMIN_API}/events/${encodeURIComponent(eventId)}/templates/${encodeURIComponent(templateId)}`,
    emailTemplate: (eventId) => `${ADMIN_API}/events/${encodeURIComponent(eventId)}/email-template`,
    surveys: (eventId) => `${ADMIN_API}/events/${encodeURIComponent(eventId)}/surveys`,
};
/**
 * Account/registration lane (cdk#387, decision cdk#464): identity-level admin-api
 * endpoints — the caller is any VERIFIED Google identity, membership NOT required
 * (the identity authorizer verifies the token; the handlers do the rest).
 * `me` is Valet's post-login probe ({registered, email, events: [...]}) — a
 * zero-membership sign-in gets a 200 with an empty list instead of the pre-#387
 * 403 dead end. `register` idempotently upserts the caller's account (PROFILE row
 * in the memberships table); Valet auto-calls it when `me` reports no account.
 */
exports.AccountApi = {
    me: `${ADMIN_API}/accounts/me`,
    register: `${ADMIN_API}/accounts`,
};
/**
 * Organizer-invitation token lanes (cdk#534/#544): the inviteId in the email
 * link is the credential. `metadata` and `decline` are unauthenticated (the
 * guest-link pattern); `accept` rides the identity authorizer — any verified
 * Google sign-in reaches it, and the handler's strict email match (#535 D6)
 * is the gate.
 */
/** Face tagging (epic cdk#782, F1–F5 on cdk#783): event-scoped persons +
 *  photo assignments. Admin verbs ride the member lane (Valet); `people` is
 *  the identified-guest People view (F3). */
exports.FacesApi = {
    base: (eventId) => `${FACES_API}/events/${encodeURIComponent(eventId)}/faces`,
    list: (eventId) => `${FACES_API}/events/${encodeURIComponent(eventId)}/faces`,
    ingest: (eventId) => `${FACES_API}/events/${encodeURIComponent(eventId)}/faces/ingest`,
    merge: (eventId) => `${FACES_API}/events/${encodeURIComponent(eventId)}/faces/merge`,
    person: (eventId, personId) => `${FACES_API}/events/${encodeURIComponent(eventId)}/faces/persons/${encodeURIComponent(personId)}`,
    people: (eventId) => `${FACES_API}/events/${encodeURIComponent(eventId)}/faces/people`,
    // One-click recognition runs (cdk#796): admin enqueue/status + the box's
    // queue lane (bearer = the faces-box secret, not a user token).
    run: (eventId) => `${FACES_API}/events/${encodeURIComponent(eventId)}/faces/run`,
    // Cancel a QUEUED run (cdk#802/#803): self-serve recovery when the box
    // never claimed it — body carries {runId}.
    runCancel: (eventId) => `${FACES_API}/events/${encodeURIComponent(eventId)}/faces/run/cancel`,
    runs: (eventId) => `${FACES_API}/events/${encodeURIComponent(eventId)}/faces/runs`,
    queue: () => `${FACES_API}/faces/queue`,
    queueClaim: () => `${FACES_API}/faces/queue/claim`,
    // Mid-run phase heartbeat (cdk#803): the box stamps where the run is.
    queueProgress: () => `${FACES_API}/faces/queue/progress`,
    queueComplete: () => `${FACES_API}/faces/queue/complete`,
};
exports.OrganizerInviteApi = {
    metadata: (inviteId) => `${ADMIN_API}/invites/${encodeURIComponent(inviteId)}`,
    accept: (inviteId) => `${ADMIN_API}/invites/${encodeURIComponent(inviteId)}/accept`,
    decline: (inviteId) => `${ADMIN_API}/invites/${encodeURIComponent(inviteId)}/decline`,
};
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
exports.GuestEventApi = {
    // Open entry (cdk#468/#508): the invite-less quick RSVP for OPEN events.
    openRsvp: (eventId) => `${PUBLIC_API}/events/${encodeURIComponent(eventId)}/rsvp/open`,
    exchange: (eventId) => `${PUBLIC_API}/events/${encodeURIComponent(eventId)}/auth/exchange`,
    claim: (eventId) => `${PUBLIC_API}/events/${encodeURIComponent(eventId)}/auth/claim`,
    // Authenticated in-UI unlink (cdk#637): removes the caller's single primary Google.
    unlink: (eventId) => `${PUBLIC_API}/events/${encodeURIComponent(eventId)}/auth/unlink`,
    invite: (eventId) => `${PUBLIC_API}/events/${encodeURIComponent(eventId)}/invite`,
    momentsPublic: (eventId) => `${PUBLIC_API}/events/${encodeURIComponent(eventId)}/moments/public`,
    wishes: (eventId) => `${PUBLIC_API}/events/${encodeURIComponent(eventId)}/wishes`,
    // Pulse (cdk#668): the generalized engagement lane — same public posture as wishes.
    pulse: (eventId) => `${PUBLIC_API}/events/${encodeURIComponent(eventId)}/pulse`,
    pulsePosts: (eventId) => `${PUBLIC_API}/events/${encodeURIComponent(eventId)}/pulse/posts`,
    pulseVotes: (eventId) => `${PUBLIC_API}/events/${encodeURIComponent(eventId)}/pulse/votes`,
    pulseReactions: (eventId) => `${PUBLIC_API}/events/${encodeURIComponent(eventId)}/pulse/reactions`,
    survey: (eventId) => `${PUBLIC_API}/events/${encodeURIComponent(eventId)}/survey`,
    rsvp: (eventId) => `${RESERVATIONS_API}/events/${encodeURIComponent(eventId)}/rsvp`,
    // The guest's own custom-stage submission (cdk#466/#513).
    stage: (eventId, stageId) => `${RESERVATIONS_API}/events/${encodeURIComponent(eventId)}/stages/${encodeURIComponent(stageId)}`,
    initiateUpload: (eventId) => `${UPLOAD_API}/events/${encodeURIComponent(eventId)}/initiate`,
    completeUpload: (eventId) => `${UPLOAD_API}/events/${encodeURIComponent(eventId)}/complete`,
};
