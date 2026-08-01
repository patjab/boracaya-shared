/** Browser identity and guest-token operations. UI controls live in `boracaya-shared/ui`. */
export {
  authHeaders,
  getEmail,
  getIdToken,
  initAuth,
  signOut,
} from '../auth';
export {
  claimIdentity,
  clearGuestToken,
  ensureGuestToken,
  guestAuthHeaders,
  guestLinkedEmail,
  loginNoEvent,
  unlinkIdentity,
} from '../guestAuth';
export type {
  ClaimCandidate,
  ClaimResult,
  NoEventLoginResult,
  UnlinkResult,
} from '../guestAuth';
