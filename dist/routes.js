"use strict";
// The canonical API route inventory — the single source of truth for
// "what endpoints exist", consumed by the pda-boracay-e2e completeness guard.
// Kept in lockstep with the backend topology by a drift test in pda-boracay-cdk.
// Update deliberately when adding/removing an endpoint.
Object.defineProperty(exports, "__esModule", { value: true });
exports.ApiRoutes = void 0;
// The flat guest/public forms (bare /rsvp, /wishes, /auth/exchange, ...) were
// DELETED at the cdk#427 contract step: the URL is the only tenant source —
// every guest/public route below is event-scoped.
exports.ApiRoutes = [
    // Event-scoped admin lanes (cdk#396 / admin#101): the URL names the target event,
    // the JWT + server-side membership check authorizes it (the shipped About pattern).
    // The flat legacy admin forms were REMOVED (cdk#405) once the Valet migration
    // (admin#104) stopped calling them; POST / (geo-IP proxy) stays — it is not
    // event data.
    { label: 'admin', method: 'GET', path: '/events/{eventId}/rsvp' },
    // Composed, preset-resolved roster (cdk#575): identity + rsvp + stage rows in one
    // read; exclusivus items carry the invitation vocabulary, inclusivus items omit it.
    { label: 'admin', method: 'GET', path: '/events/{eventId}/roster' },
    { label: 'admin', method: 'GET', path: '/events/{eventId}/invite' },
    { label: 'admin', method: 'PATCH', path: '/events/{eventId}/invite' },
    { label: 'admin', method: 'POST', path: '/events/{eventId}/scramble' },
    { label: 'admin', method: 'PATCH', path: '/events/{eventId}/scramble/increment' },
    // Custom-stage definitions + responses (cdk#466/#513): the generic stages lane.
    { label: 'admin', method: 'POST', path: '/events/{eventId}/stages' },
    { label: 'admin', method: 'PATCH', path: '/events/{eventId}/stages/{stageId}' },
    { label: 'admin', method: 'DELETE', path: '/events/{eventId}/stages/{stageId}' },
    { label: 'admin', method: 'GET', path: '/events/{eventId}/stages/{stageId}/responses' },
    { label: 'admin', method: 'PATCH', path: '/events/{eventId}/stages/{stageId}/responses/{userId}' },
    { label: 'admin', method: 'POST', path: '/events/{eventId}/assets' },
    { label: 'admin', method: 'GET', path: '/events/{eventId}/moments' },
    { label: 'admin', method: 'PATCH', path: '/events/{eventId}/moments' },
    { label: 'admin', method: 'GET', path: '/events/{eventId}/moments/public' },
    { label: 'admin', method: 'GET', path: '/events/{eventId}/templates' },
    { label: 'admin', method: 'PUT', path: '/events/{eventId}/templates' },
    { label: 'admin', method: 'PATCH', path: '/events/{eventId}/templates' },
    { label: 'admin', method: 'GET', path: '/events/{eventId}/templates/{templateId}' },
    { label: 'admin', method: 'POST', path: '/events/{eventId}/email-template' },
    { label: 'admin', method: 'GET', path: '/events/{eventId}/surveys' },
    { label: 'admin', method: 'GET', path: '/events/{eventId}/surveys/count' },
    { label: 'admin', method: 'GET', path: '/events' },
    // Account/registration lane (cdk#387, decision cdk#464): identity-level routes —
    // any verified Google identity, no membership required. POST /accounts registers
    // (idempotent PROFILE upsert); GET /accounts/me is Valet's post-login probe
    // ({registered, email, events}). POST /events below also rides this lane (a
    // zero-membership account creates its first event) with a registered-account
    // guard in the handler.
    { label: 'admin', method: 'POST', path: '/accounts' },
    { label: 'admin', method: 'GET', path: '/accounts/me' },
    // events CRUD (cdk#424): create mints the event row + the creator's OWNER
    // membership edge atomically; DELETE is a soft-archive (cdk#442 D1).
    { label: 'admin', method: 'POST', path: '/events' },
    { label: 'admin', method: 'DELETE', path: '/events/{eventId}' },
    { label: 'admin', method: 'GET', path: '/events/{eventId}' },
    { label: 'admin', method: 'PUT', path: '/events/{eventId}/about' },
    { label: 'admin', method: 'PATCH', path: '/events/{eventId}' },
    { label: 'admin', method: 'PATCH', path: '/events/{eventId}/pages/order' },
    { label: 'admin', method: 'POST', path: '/' },
    // the bare public GET /events (list) was REMOVED (cdk#352): unused by every UI and a
    // tenant-enumeration surface; the admin list stays (Valet's access-gate probe, #310).
    // The unsanitized public GET /events/{eventId} was REMOVED (cdk#442 D3, at the
    // cdk#426 contract tail): it returned the full event row; the sanitized /config
    // below is the only public read of the event CONFIG row (the /about tree below
    // is a separate, already-public content read).
    // sanitized per-event bootstrap (cdk#424, #442 D2): allowlisted display config +
    // pages; 404 on unknown/archived.
    { label: 'public', method: 'GET', path: '/events/{eventId}/config' },
    { label: 'public', method: 'GET', path: '/events/{eventId}/about' },
    // identity claim (cdk#438, #373 D2/D3): reconciles the invite-link identity with a
    // verified Google email — bind / merge / chooser-409; same lambda as the exchange.
    // Event-scoped GUEST + public lanes (cdk#427 / #386 SI-5): the URL names the target
    // event. Guest-authed lanes (rsvp/stages/uploads) also validate the token's
    // guest against the path event server-side; the public lanes take the path event
    // directly. The flat guest forms above retire at the cdk#427 contract step.
    { label: 'public', method: 'POST', path: '/events/{eventId}/auth/exchange' },
    { label: 'public', method: 'POST', path: '/events/{eventId}/auth/claim' },
    { label: 'public', method: 'GET', path: '/events/{eventId}/invite' },
    { label: 'public', method: 'GET', path: '/events/{eventId}/moments/public' },
    { label: 'public', method: 'GET', path: '/events/{eventId}/wishes' },
    { label: 'public', method: 'PUT', path: '/events/{eventId}/wishes' },
    { label: 'public', method: 'PUT', path: '/events/{eventId}/survey' },
    { label: 'reservations', method: 'GET', path: '/events/{eventId}/rsvp' },
    { label: 'reservations', method: 'PUT', path: '/events/{eventId}/rsvp' },
    // The guest's own custom-stage submission (cdk#466/#513).
    // Open entry + discovery (cdk#468, decision #508): the public quick-RSVP for
    // OPEN events (the handler's preset gate refuses invite-only events) and the
    // deliberately SCOPED public list of open events (reverses #352 for
    // inclusivus display cards only).
    { label: 'public', method: 'POST', path: '/events/{eventId}/rsvp/open' },
    { label: 'public', method: 'GET', path: '/discover' },
    { label: 'reservations', method: 'GET', path: '/events/{eventId}/stages/{stageId}' },
    { label: 'reservations', method: 'POST', path: '/events/{eventId}/stages/{stageId}' },
    { label: 'moments', method: 'POST', path: '/events/{eventId}/initiate' },
    { label: 'moments', method: 'POST', path: '/events/{eventId}/complete' },
];
