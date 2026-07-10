// The canonical API route inventory — the single source of truth for
// "what endpoints exist", consumed by the pda-boracay-e2e completeness guard.
// Kept in lockstep with the backend topology by a drift test in pda-boracay-cdk.
// Update deliberately when adding/removing an endpoint.

export interface ApiRoute {
  /** which API: public | admin | reservations | moments */
  label: string;
  method: string;
  /** resource path, no host/stage (e.g. /events/{eventId}) */
  path: string;
}

// The flat guest/public forms (bare /rsvp, /wishes, /auth/exchange, ...) were
// DELETED at the cdk#427 contract step: the URL is the only tenant source —
// every guest/public route below is event-scoped.
export const ApiRoutes: readonly ApiRoute[] = [
  // Event-scoped admin lanes (cdk#396 / admin#101): the URL names the target event,
  // the JWT + server-side membership check authorizes it (the shipped About pattern).
  // The flat legacy admin forms were REMOVED (cdk#405) once the Valet migration
  // (admin#104) stopped calling them; POST / (the geo-IP proxy) followed in
  // cdk#594 when the Monitor rework orphaned it — no flat routes remain.
  { label: 'admin', method: 'GET', path: '/events/{eventId}/rsvp' },
  // Composed, preset-resolved roster (cdk#575): identity + rsvp + stage rows in one
  // read; exclusivus items carry the invitation vocabulary, inclusivus items omit it.
  { label: 'admin', method: 'GET', path: '/events/{eventId}/roster' },
  { label: 'admin', method: 'PATCH', path: '/events/{eventId}/invite' },
  // Organizer invitations (cdk#534/#537/#544): share an event with another
  // organizer by email. Plural /invites = the organizer-invitation lifecycle;
  // the singular /invite above stays the legacy guest-invitation lane. The
  // /invites/{inviteId} token lanes ride the admin API host but metadata and
  // decline carry NO authorizer (the link is the credential); accept rides the
  // identity authorizer with the handler's strict email match as the gate.
  { label: 'admin', method: 'POST', path: '/events/{eventId}/invites' },
  { label: 'admin', method: 'GET', path: '/events/{eventId}/invites' },
  // Who administers the event (cdk#536): the memberships by-event GSI's first read.
  { label: 'admin', method: 'GET', path: '/events/{eventId}/members' },
  // Roster management (cdk#538): role change + remove/leave; OWNER-gated with
  // the transactional last-OWNER guard server-side. {accountId} = the
  // NORMALIZED email (no ACCT# prefix in URLs).
  { label: 'admin', method: 'PATCH', path: '/events/{eventId}/members/{accountId}' },
  { label: 'admin', method: 'DELETE', path: '/events/{eventId}/members/{accountId}' },
  { label: 'admin', method: 'DELETE', path: '/events/{eventId}/invites/{inviteId}' },
  { label: 'admin', method: 'GET', path: '/invites/{inviteId}' },
  { label: 'admin', method: 'POST', path: '/invites/{inviteId}/accept' },
  { label: 'admin', method: 'POST', path: '/invites/{inviteId}/decline' },
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
  // Organizer image unlink (cdk#707): deletes the backing share-bucket object AND
  // clears the metadata field (hero / post-event). Explicit destructive lane, body
  // names which field — distinct from the generic PATCH that only edits references.
  { label: 'admin', method: 'DELETE', path: '/events/{eventId}/image' },
  { label: 'admin', method: 'GET', path: '/events/{eventId}' },
  { label: 'admin', method: 'PUT', path: '/events/{eventId}/about' },
  { label: 'admin', method: 'PATCH', path: '/events/{eventId}' },
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
  // No-event Google login (cdk#623, Option D): the ONE UNSCOPED auth route — a
  // verified Google credential with no event in the URL resolves to the event(s)
  // the email is a member of (exactly one → mint + return it; zero/many → guided
  // 404). /auth/claim needs an {eventId} a no-event login doesn't have; this is
  // its unscoped sibling on the same guest-token lambda.
  { label: 'public', method: 'POST', path: '/auth/login' },
  // In-UI unlink (cdk#637): remove the caller's single primary Google. Authenticated
  // in-handler by the guest JWT (no APIGW authorizer on the auth lanes), event-scoped so
  // the unlink email can name the event.
  { label: 'public', method: 'POST', path: '/events/{eventId}/auth/unlink' },
  { label: 'public', method: 'GET', path: '/events/{eventId}/invite' },
  { label: 'public', method: 'GET', path: '/events/{eventId}/moments/public' },
  { label: 'public', method: 'GET', path: '/events/{eventId}/wishes' },
  { label: 'public', method: 'PUT', path: '/events/{eventId}/wishes' },
  // Pulse (cdk#668, decisions #669/#670): the generalized engagement lane. Public
  // parity with the wishes lane it extends (unsealed posts ARE wish rows); per-guest
  // dedupe keys on a client-supplied userId for the TESTING POC — graduation moves
  // the writes behind the guest authorizer.
  { label: 'public', method: 'GET', path: '/events/{eventId}/pulse' },
  { label: 'public', method: 'PUT', path: '/events/{eventId}/pulse/posts' },
  { label: 'public', method: 'PUT', path: '/events/{eventId}/pulse/votes' },
  { label: 'public', method: 'PUT', path: '/events/{eventId}/pulse/reactions' },
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
