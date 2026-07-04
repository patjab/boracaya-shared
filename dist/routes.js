"use strict";
// The canonical API route inventory — the single source of truth for
// "what endpoints exist", consumed by the pda-boracay-e2e completeness guard.
// Kept in lockstep with the backend topology by a drift test in pda-boracay-cdk.
// Update deliberately when adding/removing an endpoint.
Object.defineProperty(exports, "__esModule", { value: true });
exports.ApiRoutes = void 0;
exports.ApiRoutes = [
    // Event-scoped admin lanes (cdk#396 / admin#101): the URL names the target event,
    // the JWT + server-side membership check authorizes it (the shipped About pattern).
    // The flat legacy admin forms were REMOVED (cdk#405) once the Valet migration
    // (admin#104) stopped calling them; POST / (geo-IP proxy) stays — it is not
    // event data.
    { label: 'admin', method: 'GET', path: '/events/{eventId}/rsvp' },
    { label: 'admin', method: 'GET', path: '/events/{eventId}/invite' },
    { label: 'admin', method: 'PATCH', path: '/events/{eventId}/invite' },
    { label: 'admin', method: 'POST', path: '/events/{eventId}/scramble' },
    { label: 'admin', method: 'PATCH', path: '/events/{eventId}/scramble/increment' },
    { label: 'admin', method: 'GET', path: '/events/{eventId}/precheckins' },
    { label: 'admin', method: 'POST', path: '/events/{eventId}/precheckins' },
    { label: 'admin', method: 'GET', path: '/events/{eventId}/precheckins/{email}' },
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
    // events CRUD (cdk#424): create mints the event row + the creator's OWNER
    // membership edge atomically; DELETE is a soft-archive (cdk#442 D1).
    { label: 'admin', method: 'POST', path: '/events' },
    { label: 'admin', method: 'DELETE', path: '/events/{eventId}' },
    { label: 'admin', method: 'GET', path: '/events/{eventId}' },
    { label: 'admin', method: 'PUT', path: '/events/{eventId}/about' },
    { label: 'admin', method: 'PATCH', path: '/events/{eventId}' },
    { label: 'admin', method: 'PATCH', path: '/events/{eventId}/pages/order' },
    { label: 'admin', method: 'POST', path: '/' },
    { label: 'moments', method: 'POST', path: '/complete' },
    { label: 'moments', method: 'POST', path: '/initiate' },
    { label: 'moments', method: 'POST', path: '/upload' },
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
    { label: 'public', method: 'GET', path: '/invite' },
    { label: 'public', method: 'GET', path: '/moments' },
    { label: 'public', method: 'GET', path: '/moments/public' },
    { label: 'public', method: 'GET', path: '/surveys' },
    { label: 'public', method: 'GET', path: '/surveys/count' },
    { label: 'public', method: 'GET', path: '/wishes' },
    { label: 'public', method: 'POST', path: '/auth/exchange' },
    // identity claim (cdk#438, #373 D2/D3): reconciles the invite-link identity with a
    // verified Google email — bind / merge / chooser-409; same lambda as the exchange.
    { label: 'public', method: 'POST', path: '/auth/claim' },
    { label: 'public', method: 'PUT', path: '/survey' },
    { label: 'public', method: 'PUT', path: '/wishes' },
    { label: 'reservations', method: 'GET', path: '/pda-boracay-precheckins' },
    { label: 'reservations', method: 'GET', path: '/pda-boracay-precheckins/{email}' },
    { label: 'reservations', method: 'GET', path: '/rsvp' },
    { label: 'reservations', method: 'POST', path: '/pda-boracay-precheckins' },
    { label: 'reservations', method: 'PUT', path: '/rsvp' },
    // Event-scoped GUEST + public lanes (cdk#427 / #386 SI-5): the URL names the target
    // event. Guest-authed lanes (rsvp/precheckins/uploads) also validate the token's
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
    { label: 'reservations', method: 'GET', path: '/events/{eventId}/precheckins' },
    { label: 'reservations', method: 'POST', path: '/events/{eventId}/precheckins' },
    { label: 'moments', method: 'POST', path: '/events/{eventId}/initiate' },
    { label: 'moments', method: 'POST', path: '/events/{eventId}/complete' },
];
