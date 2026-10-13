/** Browser identity and guest-token operations. UI controls live in `boracaya-shared/ui`. */
export { authHeaders, getEmail, getIdToken, initAuth, signOut, } from '../auth';
export { idTokenExpiresInSeconds } from '../authToken';
export { claimIdentity, clearGuestToken, ensureGuestToken, hasGuestSession, exchangeInvitationToken, exchangeLegacyInvite, guestAuthHeaders, guestLinkedEmail, guestSubjectFromToken, guestTokenExpiresInSeconds, loginNoEvent, refreshGuestSession, unlinkIdentity, } from '../guestAuth';
export type { ClaimCandidate, ClaimResult, GuestSessionRefresh, InvitationExchange, NoEventLoginChoice, NoEventLoginResult, UnlinkResult, } from '../guestAuth';
