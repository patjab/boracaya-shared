/** Browser identity and guest-token operations. UI controls live in `boracaya-shared/ui`. */
export { authHeaders, getEmail, getIdToken, initAuth, signOut, } from '../auth.js';
export { idTokenExpiresInSeconds } from '../authToken.js';
export { claimIdentity, clearGuestToken, ensureGuestToken, exchangeInvitationToken, exchangeLegacyInvite, guestAuthHeaders, guestLinkedEmail, guestSubjectFromToken, guestTokenExpiresInSeconds, loginNoEvent, unlinkIdentity, } from '../guestAuth.js';
