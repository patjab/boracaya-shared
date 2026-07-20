/**
 * Stage schema + prefill-source registry (cdk#962, cdk#976).
 *
 * This module is the TS source of truth for stage definitions: Valet (editor)
 * and Shore (guest app) import these types instead of declaring their own
 * mirrors. The Python validation in the stages Lambda remains the enforcement
 * boundary — shapes here mirror it, they don't replace it.
 *
 * A custom-stage question may declare `defaultFrom` — where its value starts
 * from on a fresh guest form. Sources are DATA, not code: the resolvers
 * (flattening functions with full access to the guest row) live server-side in
 * the stages Lambda; PREFILL_SOURCES is the {id, label} MENU the Valet picker
 * renders, so hosts choose from human labels and never type an identifier. The
 * Lambda validates a saved `defaultFrom` against these ids (bare un-namespaced
 * ids remain valid too — they name event-config keys, the original cdk#953
 * lane). Display blocks (cdk#976) resolve their `source` through the SAME
 * registry.
 *
 * Registry rules (decision log on cdk#962):
 *  - ids are namespaced (`rsvp.*`); flattenings must be SELF-CONTAINED —
 *    meaningful without the structure they came from (names yes; a bare
 *    allergies list never).
 *  - flattened values are SEEDS, not schemas: guests edit them freely and
 *    nothing downstream may parse them back.
 *  - stage-to-stage sources are deliberately absent (star, not chain) — adding
 *    one later is a registry entry, not a new mechanism.
 */
export type StageFieldType = 'text' | 'multiline' | 'number' | 'boolean' | 'select' | 'date' | 'list' | 'repeatingGroup';
/** cdk#1011: one sub-field of a repeating group — the simple question shape
 *  with the group-level machinery removed. Sub-fields may NOT nest (no
 *  repeatingGroup inside repeatingGroup — decided up front to kill the
 *  rabbit hole), and carry no sameRow/adminOnly/defaultFrom: those belong to
 *  top-level questions only. */
export interface StageSubField {
    key: string;
    label: string;
    type: 'text' | 'multiline' | 'number' | 'boolean' | 'select' | 'date';
    required?: boolean;
    options?: string[];
    maxLength?: number;
    placeholder?: string;
}
/** cdk#1011: one entry of a repeating-group answer. */
export type RepeatingGroupEntry = Record<string, string | number | boolean>;
/** The reserved id of the core stage — RSVP itself, riding the engine. Fixed
 *  so every reader uses a static path (stages.RSVP...); pre-reserved in the
 *  lambda's stage-id denylist since long before this work. */
export declare const CORE_STAGE_ID = "RSVP";
/** The core question's fixed key: the platform's knowledge of who's coming.
 *  Its key and boolean semantics are machine-fixed (undeletable, A11); its
 *  wording is the host's. */
export declare const ATTENDANCE_KEY = "isAttending";
/** The canonical initial core-stage definition (epic #1008 bootstrap): the
 *  attendance gate, dietary needs, and companions as a repeating group.
 *  Name/email are IDENTITY, owned by the shell (A6) — deliberately not here.
 *  The server carries the same literal (its copy is authoritative; both sides
 *  pin the shape in tests) and serves it VIRTUALLY until a host edits, at
 *  which point it materializes copy-on-write. */
export declare const DEFAULT_CORE_STAGE: {
    readonly stageId: "RSVP";
    readonly title: "RSVP";
    readonly core: true;
    readonly settings: {
        readonly presentation: "stepped";
        readonly confirmation: "generic";
    };
    readonly elements: readonly [{
        readonly kind: "question";
        readonly key: "isAttending";
        readonly label: "Will you attend?";
        readonly type: "boolean";
        readonly required: true;
        readonly core: true;
    }, {
        readonly kind: "question";
        readonly key: "hasFoodRestrictions";
        readonly label: "Any food restrictions or allergies?";
        readonly type: "boolean";
    }, {
        readonly kind: "question";
        readonly key: "foodRestrictionsText";
        readonly label: "What should we know?";
        readonly type: "text";
        readonly maxLength: 500;
    }, {
        readonly kind: "question";
        readonly key: "companions";
        readonly label: "Who is coming with you?";
        readonly type: "repeatingGroup";
        readonly addLabel: "Add another guest";
        readonly subFields: readonly [{
            readonly key: "name";
            readonly label: "Name";
            readonly type: "text";
            readonly required: true;
        }, {
            readonly key: "allergies";
            readonly label: "Allergies";
            readonly type: "text";
        }];
    }];
};
export interface StageQuestion {
    /** Absent on pre-#976 configs; absent and 'question' mean the same. */
    kind?: 'question';
    key: string;
    label: string;
    type: StageFieldType;
    required?: boolean;
    options?: string[];
    maxLength?: number;
    adminOnly?: boolean;
    defaultFrom?: string;
    /** Render beside the previous question on wide screens (cdk#976). */
    sameRow?: boolean;
    /** Input hint shown while empty, e.g. "e.g., 5J 108" (cdk#976). */
    placeholder?: string;
    /** cdk#1011: repeatingGroup only — the shape of each entry. */
    subFields?: StageSubField[];
    /** cdk#1011: repeatingGroup only — hard cap on entries (server-enforced
     *  too); absent = the server default. */
    maxEntries?: number;
    /** cdk#1011: repeatingGroup only — the add button's label, host-worded
     *  ("Add another guest"); absent = "Add another". */
    addLabel?: string;
    /** cdk#1012: the core stage's attendance question — key and semantics
     *  machine-fixed, wording host-editable, undeletable (A11). */
    core?: boolean;
}
export type DisplayPresentation = 'line' | 'roster' | 'note';
/**
 * Shown, not asked (cdk#976): read-only content on a stage screen. Sourced
 * blocks resolve through the prefill registry server-side on every guest GET
 * (always live, no drift — nothing is ever saved); text blocks are host-written
 * and need no resolution. Blocks never appear in answers: the Lambda's
 * submission validation only knows question keys, so a block id in a PATCH
 * body is rejected as unknown.
 */
export interface StageDisplayBlock {
    kind: 'display';
    /** Identity for value transport (guest GET `defaults[id]`) and stable
     * rendering — never a writable answer key. Shares the key namespace with
     * questions so uniqueness is validated across both. */
    id: string;
    label?: string;
    /** Prefill-registry id (`rsvp.*`, later `event.*`) — exactly one of
     * source | text. */
    source?: string;
    /** Host-written static content — exactly one of source | text. */
    text?: string;
    /** Defaults: 'line' for sourced blocks, 'note' for text blocks. */
    presentation?: DisplayPresentation;
}
export type StageElement = StageQuestion | StageDisplayBlock;
/** cdk#1010: how a stage's form is presented to the guest. Rides the
 *  definition's existing bounded `settings` map (settings.presentation =
 *  'stepped'); anything else — absent, 'flat', junk — is flat, so the value
 *  can never break an older renderer. */
export type StagePresentation = 'flat' | 'stepped';
export declare const stagePresentation: (def: {
    settings?: Partial<Record<string, string>>;
}) => StagePresentation;
/** A stage's questions, aliased where consumers speak "fields" (both UIs did). */
export type StageField = StageQuestion;
/**
 * The stage definition document (cdk#466/#513) — THE canonical shape (shared#97,
 * cdk#1115): both UIs declared near-identical copies of this and they had
 * already drifted on `settings` strictness. Valet writes it, the guest app
 * renders it; the config handler owns validation.
 */
export interface StageDefinition {
    stageId: string;
    title: string;
    description?: string;
    icon?: string;
    /** Legacy questions-only list (pre-#976 definitions). */
    fields?: StageField[];
    /** cdk#976: the ordered mix of questions + display blocks. A definition
     * carries `elements` OR `fields`, never both — read via stageElements(). */
    elements?: StageElement[];
    settings?: Partial<Record<string, string>>;
    /** Server stamps (valet-api writes them; absent on drafts). */
    createdAt?: string;
    updatedAt?: string;
}
export declare const isDisplayBlock: (el: StageElement) => el is StageDisplayBlock;
/** A definition's ordered element list: post-#976 `elements` wins; legacy
 * `fields`-only configs read as all-questions. */
export declare const stageElements: (def: {
    elements?: ReadonlyArray<StageElement>;
    fields?: ReadonlyArray<StageQuestion>;
}) => ReadonlyArray<StageElement>;
/** The askable subset, in order — what submissions, seeds, and response
 * columns are built from. */
export declare const stageQuestions: (elements: ReadonlyArray<StageElement>) => StageQuestion[];
export interface PrefillSource {
    /** Namespaced registry id stored in a field's `defaultFrom` / a display
     * block's `source`. */
    id: string;
    /** Host-facing label shown in the Valet "Starts as…" / "Shows…" pickers. */
    label: string;
}
export declare const PREFILL_SOURCES: readonly PrefillSource[];
/** Reserved top-level keys on stage-lane responses (cdk#962): the guest GET
 * body is flat (field keys at top level), so these ride beside the answers and
 * a field key may never claim them. Mirrors the Lambda's RESERVED_FIELD_KEYS. */
export declare const STAGE_RESPONSE_META_KEYS: readonly ["defaults", "drift"];
/**
 * Client-side mirror of the Lambda's resolvers (prefill.py) — SAME semantics,
 * kept in shared so every consumer compares drift one way. The server remains
 * the authority on the guest lanes (GET defaults / responses drift); this
 * mirror serves surfaces that already hold the guest's row client-side (the
 * Valet guest drawer reads the roster row, which carries names + rsvp +
 * stages). Resolvers take the guest ROW (not just rsvp) since cdk#976 —
 * matching prefill.py, whose resolvers always took the row.
 */
export interface GuestRowLike {
    firstName?: unknown;
    lastName?: unknown;
    rsvp?: Record<string, unknown>;
    /** cdk#1016: the core-stage responses map (stages.RSVP...) — the
     *  post-cutover home the resolvers prefer. */
    stages?: Record<string, unknown>;
}
/** Mirror of the Lambda's guest_display_name: row names first, RSVP fallbacks
 * second, empty string when nothing is known. */
export declare const guestDisplayName: (guest: GuestRowLike | undefined) => string;
/** One registry source's current value from the guest's own row, or undefined
 * when the id is unknown/bare or resolves to nothing. */
export declare const resolvePrefillSource: (id: string, guest: GuestRowLike | undefined) => string[] | undefined;
/** Question keys whose SAVED stage answer differs from its declared registry
 * source (#965 allowance): declared edges only, direction-agnostic. Mirrors
 * the Lambda's drift_keys — the responses grid uses the server's flag; the
 * guest drawer computes the same thing from the roster row it already holds.
 * Display blocks never drift (nothing saved) and are skipped by construction:
 * they carry no `key`. */
export declare const stageDriftKeys: (fields: ReadonlyArray<{
    key: string;
    defaultFrom?: string;
}>, guest: GuestRowLike | undefined, stagePayload: Record<string, unknown> | undefined) => string[];
