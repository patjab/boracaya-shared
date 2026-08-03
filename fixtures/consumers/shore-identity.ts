import {
  claimIdentity,
  getEmail,
  getIdToken,
  guestAuthHeaders,
  guestLinkedEmail,
  loginNoEvent,
  unlinkIdentity,
  type ClaimCandidate,
} from 'boracaya-shared/identity';

/** The complete identity seam exercised by Shore production code. */
export const exerciseShoreIdentity = async (
  eventId: string,
  userId: string,
  choose?: ClaimCandidate,
) => {
  const credential = getIdToken();
  const email = getEmail();
  const headers = await guestAuthHeaders(eventId, userId);
  const linkedEmail = await guestLinkedEmail(eventId, userId);
  const login = credential ? await loginNoEvent(credential) : undefined;
  const claim = credential
    ? await claimIdentity({
        eventId,
        userId,
        credential,
        chooseUserId: choose?.userId,
      })
    : undefined;
  const unlink = await unlinkIdentity(eventId);

  return { email, headers, linkedEmail, login, claim, unlink };
};
