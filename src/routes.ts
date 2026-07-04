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

export const ApiRoutes: readonly ApiRoute[] = [
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
  { label: 'public', method: 'GET', path: '/events/{eventId}' },
  { label: 'public', method: 'GET', path: '/events/{eventId}/about' },
  { label: 'public', method: 'GET', path: '/invite' },
  { label: 'public', method: 'GET', path: '/moments' },
  { label: 'public', method: 'GET', path: '/moments/public' },
  { label: 'public', method: 'GET', path: '/surveys' },
  { label: 'public', method: 'GET', path: '/surveys/count' },
  { label: 'public', method: 'GET', path: '/wishes' },
  { label: 'public', method: 'POST', path: '/auth/exchange' },
  { label: 'public', method: 'PUT', path: '/survey' },
  { label: 'public', method: 'PUT', path: '/wishes' },
  { label: 'reservations', method: 'GET', path: '/pda-boracay-precheckins' },
  { label: 'reservations', method: 'GET', path: '/pda-boracay-precheckins/{email}' },
  { label: 'reservations', method: 'GET', path: '/rsvp' },
  { label: 'reservations', method: 'POST', path: '/pda-boracay-precheckins' },
  { label: 'reservations', method: 'PUT', path: '/rsvp' },
];
