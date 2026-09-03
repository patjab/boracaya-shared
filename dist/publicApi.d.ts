/** Public/bootstrap endpoints used by Shore. */
export declare const PublicApi: {
    readonly EVENTS: string;
    readonly DISCOVER: string;
    readonly GUEST_LOGIN: string;
    readonly TELEMETRY_ERRORS: string;
    readonly FACES_CONTROL: string;
    readonly FACES_BOX: string;
};
/** Event-scoped guest and public endpoints. */
export declare const GuestEventApi: {
    readonly openRsvp: (eventId: string) => string;
    readonly exchange: (eventId: string) => string;
    readonly claim: (eventId: string) => string;
    readonly unlink: (eventId: string) => string;
    readonly invite: (eventId: string) => string;
    readonly momentsPublic: (eventId: string) => string;
    readonly wishes: (eventId: string) => string;
    readonly pulse: (eventId: string) => string;
    readonly pulseMine: (eventId: string) => string;
    readonly pulsePosts: (eventId: string) => string;
    readonly pulseVotes: (eventId: string) => string;
    readonly pulseReactions: (eventId: string) => string;
    readonly survey: (eventId: string) => string;
    readonly rsvp: (eventId: string) => string;
    readonly stage: (eventId: string, stageId: string) => string;
    readonly initiateUpload: (eventId: string) => string;
    readonly completeUpload: (eventId: string) => string;
};
