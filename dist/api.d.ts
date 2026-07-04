export declare const ApiConstants: {
    readonly GET_ALL_INVITES: `${string}/invite?userId=lakandula`;
    readonly GET_INVITE: `${string}/invite`;
    readonly CREATE_INVITES_BY_CSV_UPLOAD: `${string}/scramble`;
    readonly INCREMENT_COUNT_OF_INVITE_SENT: `${string}/scramble/increment`;
    readonly SET_INVITED_BY: `${string}/invite`;
    readonly AUTH_EXCHANGE: `${string}/auth/exchange`;
    readonly AUTH_CLAIM: `${string}/auth/claim`;
    readonly GET_RSVPS: `${string}/rsvp`;
    readonly GET_ALL_RSVPS: `${string}/rsvp`;
    readonly GET_PRECHECKINS: `${string}/pda-boracay-precheckins`;
    readonly GET_ALL_PRECHECKINS: `${string}/pda-boracay-precheckins`;
    readonly GET_SAVE_THE_DATE_RECORDS: `${string}/records`;
    readonly SAVE_THE_DATE_RECORD: `${string}/record`;
    readonly GUEST_AUTH: `${string}/guest?guest=`;
    readonly GET_ALL_SURVEYS: `${string}/surveys`;
    readonly GET_SURVEY_COUNTS: `${string}/surveys/count`;
    readonly GET_IP_ADDRESSES: string;
    readonly LOGIN: `${string}/login`;
    readonly ADMIN_EVENTS: `${string}/events`;
    readonly TEMPLATES: `${string}/templates`;
    readonly EMAIL_TEMPLATE: `${string}/email-template`;
    readonly WISHES: `${string}/wishes`;
    readonly EVENTS: `${string}/events`;
    readonly SURVEY: `${string}/survey`;
    readonly INITIATE_UPLOAD: `${string}/initiate`;
    readonly COMPLETE_UPLOAD: `${string}/complete`;
    readonly MOMENTS_ADMIN: `${string}/moments`;
    readonly MOMENTS_PUBLIC: `${string}/moments/public`;
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
 * The flat ApiConstants forms above remain until the Valet migration completes
 * (cdk#405 removes them).
 */
export declare const AdminEventApi: {
    readonly config: (eventId: string) => string;
    readonly pagesOrder: (eventId: string) => string;
    readonly about: (eventId: string) => string;
    readonly rsvps: (eventId: string) => string;
    readonly invites: (eventId: string) => string;
    readonly scramble: (eventId: string) => string;
    readonly scrambleIncrement: (eventId: string) => string;
    readonly precheckins: (eventId: string) => string;
    readonly precheckinByEmail: (eventId: string, email: string) => string;
    /** Organizer asset-upload presign (cdk#394): admin-authorized, tenant-prefixed key. */
    readonly assets: (eventId: string) => string;
    readonly moments: (eventId: string) => string;
    readonly momentsPublic: (eventId: string) => string;
    readonly templates: (eventId: string) => string;
    readonly template: (eventId: string, templateId: string) => string;
    readonly emailTemplate: (eventId: string) => string;
    readonly surveys: (eventId: string) => string;
    readonly surveyCounts: (eventId: string) => string;
};
/**
 * Event-scoped GUEST + public endpoints (cdk#427 / #386 SI-5): the URL names the
 * TARGET event — the guest SPA's path-prefix tenant (cdk#447) reaches the API as a
 * path segment, never a server-pinned default. The guest-authed lanes
 * (rsvp/precheckins/uploads) are additionally validated server-side: the token's
 * guest must have a PROFILE row in the path event (fail closed). The public lanes
 * (auth/invite/moments-public/wishes/survey) take the path event directly.
 * The flat ApiConstants forms above remain until the cdk#427 contract step deletes
 * the flat routes.
 */
export declare const GuestEventApi: {
    readonly exchange: (eventId: string) => string;
    readonly claim: (eventId: string) => string;
    readonly invite: (eventId: string) => string;
    readonly momentsPublic: (eventId: string) => string;
    readonly wishes: (eventId: string) => string;
    readonly survey: (eventId: string) => string;
    readonly rsvp: (eventId: string) => string;
    readonly precheckins: (eventId: string) => string;
    readonly initiateUpload: (eventId: string) => string;
    readonly completeUpload: (eventId: string) => string;
};
