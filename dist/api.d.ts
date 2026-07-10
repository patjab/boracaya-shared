export declare const ApiConstants: {
    readonly ADMIN_EVENTS: `${string}/events`;
    readonly EVENTS: `${string}/events`;
    readonly DISCOVER: `${string}/discover`;
    readonly GUEST_LOGIN: `${string}/auth/login`;
    readonly FACES_CONTROL: string;
    readonly FACES_BOX: string;
    readonly MOMENTS_OFFICIAL_MANIFEST: `${string}/uploads/official/manifest.json`;
    readonly MOMENTS_OFFICIAL_BOOT: `${string}/uploads/official/_boot.json`;
};
/**
 * Event-scoped admin endpoints (cdk#396 / admin#101): the URL names the TARGET event;
 * the caller's Google ID token plus the server-side membership check authorize it
 * (the shipped About-PUT pattern, generalized). One builder per lane so no consumer
 * ever hand-assembles a path; eventId/templateId/email are URI-encoded here.
 * The flat ApiConstants forms are GONE (cdk#405 / shared#57) — every admin call
 * rides these event-scoped builders.
 */
export declare const AdminEventApi: {
    readonly config: (eventId: string) => string;
    readonly about: (eventId: string) => string;
    readonly rsvps: (eventId: string) => string;
    readonly roster: (eventId: string) => string;
    readonly organizerInvites: (eventId: string) => string;
    readonly members: (eventId: string) => string;
    readonly member: (eventId: string, accountId: string) => string;
    readonly organizerInvite: (eventId: string, inviteId: string) => string;
    readonly scramble: (eventId: string) => string;
    readonly scrambleIncrement: (eventId: string) => string;
    readonly stages: (eventId: string) => string;
    readonly stage: (eventId: string, stageId: string) => string;
    readonly stageResponses: (eventId: string, stageId: string) => string;
    readonly stageResponse: (eventId: string, stageId: string, userId: string) => string;
    /** Organizer asset-upload presign (cdk#394): admin-authorized, tenant-prefixed key. */
    readonly assets: (eventId: string) => string;
    /** Organizer image unlink (cdk#707): DELETE clears the field + deletes the S3 object. */
    readonly image: (eventId: string) => string;
    readonly moments: (eventId: string) => string;
    readonly momentsPublic: (eventId: string) => string;
    readonly templates: (eventId: string) => string;
    readonly template: (eventId: string, templateId: string) => string;
    readonly emailTemplate: (eventId: string) => string;
    readonly surveys: (eventId: string) => string;
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
export declare const AccountApi: {
    readonly me: `${string}/accounts/me`;
    readonly register: `${string}/accounts`;
};
/**
 * Organizer-invitation token lanes (cdk#534/#544): the inviteId in the email
 * link is the credential. `metadata` and `decline` are unauthenticated (the
 * guest-link pattern); `accept` rides the identity authorizer — any verified
 * Google sign-in reaches it, and the handler's strict email match (#535 D6)
 * is the gate.
 */
export declare const OrganizerInviteApi: {
    readonly metadata: (inviteId: string) => string;
    readonly accept: (inviteId: string) => string;
    readonly decline: (inviteId: string) => string;
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
export declare const GuestEventApi: {
    readonly openRsvp: (eventId: string) => string;
    readonly exchange: (eventId: string) => string;
    readonly claim: (eventId: string) => string;
    readonly unlink: (eventId: string) => string;
    readonly invite: (eventId: string) => string;
    readonly momentsPublic: (eventId: string) => string;
    readonly wishes: (eventId: string) => string;
    readonly pulse: (eventId: string) => string;
    readonly pulsePosts: (eventId: string) => string;
    readonly pulseVotes: (eventId: string) => string;
    readonly pulseReactions: (eventId: string) => string;
    readonly survey: (eventId: string) => string;
    readonly rsvp: (eventId: string) => string;
    readonly stage: (eventId: string, stageId: string) => string;
    readonly initiateUpload: (eventId: string) => string;
    readonly completeUpload: (eventId: string) => string;
};
