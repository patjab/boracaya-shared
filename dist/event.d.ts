/**
 * The event-config document, as the UIs consume it (cdk#1116; founder call
 * 2026-07-19: UI-side contract only — the Lambdas adopt these declarations at a
 * later cdk repin, #1085). Both UIs previously hand-modeled projections of this
 * same server document (Valet's EventMetadata, Shore's DynamicAppContext
 * metadata) and drift was silent until a guest page misrendered what Valet
 * saved.
 *
 * Shape: a shared CORE (fields both the admin read `GET /events/{id}` and the
 * public read `GET /events/{id}/config` carry) plus per-lane variants — honest
 * about the real difference: the public read sanitizes (shell/style arrive
 * UNTRUSTED and the guest app re-validates), while the admin read carries
 * admin-only sections (the passport stamp lane).
 */
import type { HotelAreaOption } from './types';
import type { StageDefinition } from './stages';
import type { PulseConfig } from './pulse';
import type { ShellKey, StyleConfig } from './shells';
/** The guest pipeline preset (cdk#466/#574). Absent = 'exclusivus' — the
 *  platform-wide grandfather rule for pre-preset events. */
export type EventPreset = 'exclusivus' | 'inclusivus';
/** Hero image height presets (cdk#1055/#1056). */
export type HeroHeight = 'full' | 'standard' | 'compact';
/** A named moments album (cdk#790 A3 / #973): Candids is implicit — these are
 *  the host-created extras. kind: 'curated' = hosts only (absent default),
 *  'open' = guests may upload into it from the gallery. */
export interface EventAlbum {
    albumId: string;
    name: string;
    kind?: 'curated' | 'open';
}
/**
 * Fields BOTH lanes carry on the config document. Everything here is event
 * config, never code literals (cdk#390); all optional — a missing field
 * renders a neutral fallback (guest) or an empty editor (Valet).
 */
export interface EventConfigCore {
    eventDateISOString?: string;
    /** Optional (cdk#488): events minted before create-time seeding lack it.
     *  Absent must read as "reservations open" — never compare undefined. */
    daysBeforeEventLastDayToBook?: number;
    /** Legacy theme regime — superseded by `style` where present. */
    theme?: string;
    /** Canonical event display name (cdk#913). */
    eventDisplayName?: string;
    tagline?: string;
    heroImageUrl?: string;
    heroHeight?: HeroHeight;
    finishedEventImageUrl?: string;
    /** Guest groups (cdk#393/#824): labels ARE the stored post values;
     *  absent/empty hides the whole feature. */
    guestGroups?: string[];
    /** Room-block hotel (cdk#391): check-in defaults room-block guests to it
     *  only when BOTH fields are set. */
    blockHotelName?: string;
    blockHotelArea?: string;
    /** Optional per-event attendance question (cdk#392): presence enables it;
     *  the label is the only place its name lives. */
    extraAttendanceLabel?: string;
    /** Check-in area options (cdk#412): absent/empty → free-text area input. */
    hotelAreaOptions?: HotelAreaOption[];
    preset?: EventPreset;
    /** The event's custom stages (cdk#466/#513). ABSENT = pipeline not adopted
     *  (legacy pages config authoritative); EMPTY = no custom stages. */
    stages?: StageDefinition[];
    /** Pulse config (cdk#668/#671). Absent = the feature is off / not yet
     *  configured — the page row can land before the config does. */
    pulse?: PulseConfig;
    /** Named moments albums. The guest gallery reads this defensively. */
    albums?: EventAlbum[];
}
/**
 * The ADMIN lane's metadata (valet-api `GET /events/{id}` / the config PATCH
 * document): the core plus admin-typed identity/style and the passport-stamp
 * section. Valet's editor carries unknown fields through unchanged so a PATCH
 * never drops event settings it doesn't know about.
 */
export interface AdminEventMetadata extends EventConfigCore {
    shell?: ShellKey;
    style?: StyleConfig;
    /** Per-event guest-site copy (cdk#776 D26): sparse map — absent keys fall
     *  back to the guest engine's generic defaults. */
    vocabulary?: Record<string, string>;
    stampImageUrl?: string;
    /** Absent-value default follows the preset (exclusivus→redacted,
     *  inclusivus→named); the server seeds it at create. */
    stampNaming?: 'named' | 'redacted';
    /** The check-in hinge: which stage + boolean field mints the stamp.
     *  Explicit null = detach (the server treats absent/null as doorless). */
    doorStage?: {
        stageId: string;
        field: string;
    } | null;
}
/**
 * The PUBLIC lane's metadata (public `GET /events/{id}/config`): the core with
 * the guest invariants (the tenant id always rides the payload) and the
 * sanitized-but-UNTRUSTED presentation fields — the guest app re-validates
 * shell (isShellKey fallback to classic) and style/vocabulary on its own and
 * never relies on server sanitization (cdk#742).
 */
export interface PublicEventMetadata extends EventConfigCore {
    eventId: string;
    shell?: string;
    style?: unknown;
    vocabulary?: unknown;
}
/** One sub-tab leaf of a page's stored sub-navigation. */
export interface EventPageSubLeaf {
    key: string;
    title: string;
    isActive: boolean;
}
export interface EventPageSubGroup {
    key: string;
    title: string;
    isActive: boolean;
    leaves: EventPageSubLeaf[];
}
/**
 * One row of the event's page catalog (the guest site's menu; cdk#967/#970
 * re-keyed pages to (eventId, pageEnum)). Both lanes carry the same rows; the
 * public read additionally stamps eventId on each (see Shore's DynamicPage).
 */
export interface EventPage {
    pageEnum: string;
    type: string;
    displayName: string;
    pageOrder: number;
    isActive: boolean;
    subTabs?: EventPageSubGroup[];
}
/**
 * One event the signed-in organizer administers, as admin `GET /events`
 * returns it (cdk#396: the caller's memberships). A fresh event without a
 * config row arrives id-only, so every display field is optional.
 */
export interface AdminEvent {
    eventId: string;
    eventDisplayName?: string;
    eventDateISOString?: string;
    tagline?: string;
    extraAttendanceLabel?: string;
    preset?: EventPreset;
    /** The caller's role (cdk#429, D2 cdk#522): gates owner-only surfaces.
     *  Absent = OWNER, the API's grandfather rule for role-less edges. */
    myRole?: string;
    /** Soft-archive bookkeeping (cdk#424/#442 D1): 'ARCHIVED' = offline for
     *  guests and filtered from the owner session at the parse seam (cdk#533). */
    status?: string;
}
