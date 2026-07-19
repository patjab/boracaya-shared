export interface Companion {
    name: string;
    allergies: string;
}
/**
 * One entry of the OPTIONAL `hotelAreaOptions` event-metadata list (cdk#528):
 * the room-block (PRECHECKIN) stage's area picker choices. Most events carry
 * no list at all — hotels are a per-event opt-in, not a platform assumption;
 * this only types an entry when the organizer configured the feature.
 */
export interface HotelAreaOption {
    id: string;
    displayName: string;
}
/**
 * The guest's own RSVP record (the reservations-api rsvp lane) — THE canonical
 * contract (shared#97, cdk#1115; the guest app previously declared its own copy
 * and inlined Companion's shape). Valet's roster types are PROJECTIONS of this
 * plus identity — related on purpose, not duplicates.
 */
export interface RSVPRecord {
    name: string;
    firstName?: string;
    lastName?: string;
    email: string;
    isAttending: boolean;
    hasFoodRestrictions: boolean;
    foodRestrictionsText?: string;
    companions?: Companion[];
}
