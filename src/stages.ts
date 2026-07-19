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

// --- Stage element schema (cdk#976) -----------------------------------------

export type StageFieldType =
    'text' | 'multiline' | 'number' | 'boolean' | 'select' | 'date' | 'list'
    | 'repeatingGroup';

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

// --- The fixed core stage (cdk#1012, decisions cdk#1009 A8-A11) -------------

/** The reserved id of the core stage — RSVP itself, riding the engine. Fixed
 *  so every reader uses a static path (stages.RSVP...); pre-reserved in the
 *  lambda's stage-id denylist since long before this work. */
export const CORE_STAGE_ID = 'RSVP';

/** The core question's fixed key: the platform's knowledge of who's coming.
 *  Its key and boolean semantics are machine-fixed (undeletable, A11); its
 *  wording is the host's. */
export const ATTENDANCE_KEY = 'isAttending';

/** The canonical initial core-stage definition (epic #1008 bootstrap): the
 *  attendance gate, dietary needs, and companions as a repeating group.
 *  Name/email are IDENTITY, owned by the shell (A6) — deliberately not here.
 *  The server carries the same literal (its copy is authoritative; both sides
 *  pin the shape in tests) and serves it VIRTUALLY until a host edits, at
 *  which point it materializes copy-on-write. */
export const DEFAULT_CORE_STAGE = {
    stageId: CORE_STAGE_ID,
    title: 'RSVP',
    core: true,
    settings: { presentation: 'stepped', confirmation: 'generic' },
    elements: [
        { kind: 'question', key: ATTENDANCE_KEY, label: 'Will you attend?',
            type: 'boolean', required: true, core: true },
        { kind: 'question', key: 'hasFoodRestrictions',
            label: 'Any food restrictions or allergies?', type: 'boolean' },
        { kind: 'question', key: 'companions', label: 'Who is coming with you?',
            type: 'repeatingGroup', addLabel: 'Add another guest',
            subFields: [
                { key: 'name', label: 'Name', type: 'text', required: true },
                { key: 'allergies', label: 'Allergies', type: 'text' },
            ] },
    ],
} as const;

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

export const stagePresentation = (def: {
    settings?: Partial<Record<string, string>>;
}): StagePresentation => (def.settings?.presentation === 'stepped' ? 'stepped' : 'flat');

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
    // Optional per-stage tab icon (cdk#618): an emoji or a curated icon-name
    // (Valet's ContentIconPicker). The guest Attend tab strip renders EMOJI
    // only; a curated icon-name is dropped there rather than shown as raw text.
    icon?: string;
    /** Legacy questions-only list (pre-#976 definitions). */
    fields?: StageField[];
    /** cdk#976: the ordered mix of questions + display blocks. A definition
     * carries `elements` OR `fields`, never both — read via stageElements(). */
    elements?: StageElement[];
    // Per-stage behavior knobs (cdk#528), e.g. PRECHECKIN's blockHotelName /
    // blockHotelArea — config, not guest-writable fields. Partial: an absent
    // key means the knob is OFF, so lookups type as string | undefined.
    settings?: Partial<Record<string, string>>;
    /** Server stamps (valet-api writes them; absent on drafts). */
    createdAt?: string;
    updatedAt?: string;
}

export const isDisplayBlock = (el: StageElement): el is StageDisplayBlock =>
    (el as StageDisplayBlock).kind === 'display';

/** A definition's ordered element list: post-#976 `elements` wins; legacy
 * `fields`-only configs read as all-questions. */
export const stageElements = (def: {
    elements?: ReadonlyArray<StageElement>;
    fields?: ReadonlyArray<StageQuestion>;
}): ReadonlyArray<StageElement> => def.elements ?? def.fields ?? [];

/** The askable subset, in order — what submissions, seeds, and response
 * columns are built from. */
export const stageQuestions = (
    elements: ReadonlyArray<StageElement>,
): StageQuestion[] => elements.filter((el): el is StageQuestion => !isDisplayBlock(el));

// --- Prefill-source registry menu (cdk#962) ---------------------------------

export interface PrefillSource {
    /** Namespaced registry id stored in a field's `defaultFrom` / a display
     * block's `source`. */
    id: string;
    /** Host-facing label shown in the Valet "Starts as…" / "Shows…" pickers. */
    label: string;
}

export const PREFILL_SOURCES: readonly PrefillSource[] = [
    { id: 'rsvp.companionNames', label: "Companion names — from their RSVP" },
    { id: 'rsvp.companionsWithAllergies', label: "Companions with allergies — from their RSVP" },
    { id: 'rsvp.partyNames', label: "Party names — the guest plus companions, from their RSVP" },
];

/** Reserved top-level keys on stage-lane responses (cdk#962): the guest GET
 * body is flat (field keys at top level), so these ride beside the answers and
 * a field key may never claim them. Mirrors the Lambda's RESERVED_FIELD_KEYS. */
export const STAGE_RESPONSE_META_KEYS = ['defaults', 'drift'] as const;

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

type CompanionEntry = { name: string; allergies: string };

/** cdk#1016 (mirror of the Lambda's precedence): companions come from the
 *  core-stage response first — an ARRAY there is an answer, [] included — and
 *  from the legacy rsvp map only when no core list exists. */
const companionList = (guest: GuestRowLike | undefined): unknown => {
    const stages = guest?.stages;
    const core = stages && typeof stages === 'object'
        ? (stages as Record<string, unknown>).RSVP : undefined;
    const fromCore = core && typeof core === 'object'
        ? (core as Record<string, unknown>).companions : undefined;
    if (Array.isArray(fromCore)) return fromCore;
    return guest?.rsvp?.companions;
};

const companionEntries = (guest: GuestRowLike | undefined): CompanionEntry[] => {
    const companions = companionList(guest);
    if (!Array.isArray(companions)) return [];
    const entries: CompanionEntry[] = [];
    for (const c of companions) {
        if (typeof c !== 'object' || c === null) continue;
        const name = (c as Record<string, unknown>).name;
        if (typeof name !== 'string' || !name.trim()) continue;
        const allergies = (c as Record<string, unknown>).allergies;
        entries.push({ name: name.trim(),
                       allergies: typeof allergies === 'string' ? allergies.trim() : '' });
    }
    return entries;
};

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

/** Mirror of the Lambda's guest_display_name: row names first, RSVP fallbacks
 * second, empty string when nothing is known. */
export const guestDisplayName = (guest: GuestRowLike | undefined): string => {
    const fromRow = [str(guest?.firstName), str(guest?.lastName)].filter(Boolean).join(' ');
    if (fromRow) return fromRow;
    return str(guest?.rsvp?.preferredName) || str(guest?.rsvp?.name);
};

const RESOLVERS: Record<string, (guest: GuestRowLike | undefined) => string[]> = {
    'rsvp.companionNames': (g) => companionEntries(g).map((e) => e.name),
    'rsvp.companionsWithAllergies': (g) => companionEntries(g)
        .map((e) => (e.allergies ? `${e.name} (${e.allergies})` : e.name)),
    'rsvp.partyNames': (g) => {
        const name = guestDisplayName(g);
        const companions = companionEntries(g).map((e) => e.name);
        return name ? [name, ...companions] : companions;
    },
};

/** One registry source's current value from the guest's own row, or undefined
 * when the id is unknown/bare or resolves to nothing. */
export const resolvePrefillSource = (
    id: string, guest: GuestRowLike | undefined,
): string[] | undefined => {
    const resolved = RESOLVERS[id]?.(guest);
    return resolved && resolved.length > 0 ? resolved : undefined;
};

/** Content compare, not representation (mirrors prefill._normalized): lists as
 * stripped multisets — reordering companions is not drift — strings stripped. */
const normalized = (value: unknown): unknown => {
    if (Array.isArray(value)) return JSON.stringify([...value].map((v) => String(v).trim()).sort());
    if (typeof value === 'string') return value.trim();
    return value;
};

/** Question keys whose SAVED stage answer differs from its declared registry
 * source (#965 allowance): declared edges only, direction-agnostic. Mirrors
 * the Lambda's drift_keys — the responses grid uses the server's flag; the
 * guest drawer computes the same thing from the roster row it already holds.
 * Display blocks never drift (nothing saved) and are skipped by construction:
 * they carry no `key`. */
export const stageDriftKeys = (
    fields: ReadonlyArray<{ key: string; defaultFrom?: string }>,
    guest: GuestRowLike | undefined,
    stagePayload: Record<string, unknown> | undefined,
): string[] => {
    const saved = stagePayload ?? {};
    const out: string[] = [];
    for (const f of fields) {
        if (!f.defaultFrom || !(f.defaultFrom in RESOLVERS)) continue;
        if (!(f.key in saved)) continue;
        const current = resolvePrefillSource(f.defaultFrom, guest);
        if (current === undefined) continue;
        if (normalized(saved[f.key]) !== normalized(current)) out.push(f.key);
    }
    return out;
};
