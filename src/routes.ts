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
  { label: 'admin', method: 'GET', path: '/events' },
  { label: 'admin', method: 'GET', path: '/events/{eventId}' },
  { label: 'admin', method: 'GET', path: '/events/{eventId}/subevents' },
  { label: 'admin', method: 'GET', path: '/invite' },
  { label: 'admin', method: 'GET', path: '/moments' },
  { label: 'admin', method: 'GET', path: '/moments/public' },
  { label: 'admin', method: 'GET', path: '/templates' },
  { label: 'admin', method: 'GET', path: '/templates/{templateId}' },
  { label: 'admin', method: 'PATCH', path: '/events/{eventId}' },
  { label: 'admin', method: 'PATCH', path: '/events/{eventId}/pages/order' },
  { label: 'admin', method: 'PATCH', path: '/events/{eventId}/subevents' },
  { label: 'admin', method: 'GET', path: '/pda-boracay-precheckins' },
  { label: 'admin', method: 'GET', path: '/rsvp' },
  { label: 'admin', method: 'PATCH', path: '/invite' },
  { label: 'admin', method: 'PATCH', path: '/moments' },
  { label: 'admin', method: 'PATCH', path: '/scramble/increment' },
  { label: 'admin', method: 'PATCH', path: '/templates' },
  { label: 'admin', method: 'POST', path: '/' },
  { label: 'admin', method: 'POST', path: '/email-template' },
  { label: 'admin', method: 'POST', path: '/scramble' },
  { label: 'admin', method: 'PUT', path: '/templates' },
  { label: 'moments', method: 'POST', path: '/complete' },
  { label: 'moments', method: 'POST', path: '/initiate' },
  { label: 'moments', method: 'POST', path: '/upload' },
  { label: 'public', method: 'GET', path: '/events' },
  { label: 'public', method: 'GET', path: '/events/{eventId}' },
  { label: 'public', method: 'GET', path: '/events/{eventId}/subevents' },
  { label: 'public', method: 'GET', path: '/invite' },
  { label: 'public', method: 'GET', path: '/moments' },
  { label: 'public', method: 'GET', path: '/moments/public' },
  { label: 'public', method: 'GET', path: '/surveys' },
  { label: 'public', method: 'GET', path: '/surveys/count' },
  { label: 'public', method: 'GET', path: '/wishes' },
  { label: 'public', method: 'PUT', path: '/survey' },
  { label: 'public', method: 'PUT', path: '/wishes' },
  { label: 'reservations', method: 'GET', path: '/pda-boracay-precheckins' },
  { label: 'reservations', method: 'GET', path: '/pda-boracay-precheckins/{email}' },
  { label: 'reservations', method: 'GET', path: '/rsvp' },
  { label: 'reservations', method: 'POST', path: '/pda-boracay-precheckins' },
  { label: 'reservations', method: 'PUT', path: '/rsvp' },
];
