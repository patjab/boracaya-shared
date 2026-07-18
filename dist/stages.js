"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.stageDriftKeys = exports.resolvePrefillSource = exports.guestDisplayName = exports.STAGE_RESPONSE_META_KEYS = exports.PREFILL_SOURCES = exports.stageQuestions = exports.stageElements = exports.isDisplayBlock = exports.stagePresentation = exports.DEFAULT_CORE_STAGE = exports.ATTENDANCE_KEY = exports.CORE_STAGE_ID = void 0;
// --- The fixed core stage (cdk#1012, decisions cdk#1009 A8-A11) -------------
/** The reserved id of the core stage — RSVP itself, riding the engine. Fixed
 *  so every reader uses a static path (stages.RSVP...); pre-reserved in the
 *  lambda's stage-id denylist since long before this work. */
exports.CORE_STAGE_ID = 'RSVP';
/** The core question's fixed key: the platform's knowledge of who's coming.
 *  Its key and boolean semantics are machine-fixed (undeletable, A11); its
 *  wording is the host's. */
exports.ATTENDANCE_KEY = 'isAttending';
/** The canonical initial core-stage definition (epic #1008 bootstrap): the
 *  attendance gate, dietary needs, and companions as a repeating group.
 *  Name/email are IDENTITY, owned by the shell (A6) — deliberately not here.
 *  The server carries the same literal (its copy is authoritative; both sides
 *  pin the shape in tests) and serves it VIRTUALLY until a host edits, at
 *  which point it materializes copy-on-write. */
exports.DEFAULT_CORE_STAGE = {
    stageId: exports.CORE_STAGE_ID,
    title: 'RSVP',
    core: true,
    settings: { presentation: 'stepped', confirmation: 'generic' },
    elements: [
        { kind: 'question', key: exports.ATTENDANCE_KEY, label: 'Will you attend?',
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
};
const stagePresentation = (def) => { var _a; return (((_a = def.settings) === null || _a === void 0 ? void 0 : _a.presentation) === 'stepped' ? 'stepped' : 'flat'); };
exports.stagePresentation = stagePresentation;
const isDisplayBlock = (el) => el.kind === 'display';
exports.isDisplayBlock = isDisplayBlock;
/** A definition's ordered element list: post-#976 `elements` wins; legacy
 * `fields`-only configs read as all-questions. */
const stageElements = (def) => { var _a, _b; return (_b = (_a = def.elements) !== null && _a !== void 0 ? _a : def.fields) !== null && _b !== void 0 ? _b : []; };
exports.stageElements = stageElements;
/** The askable subset, in order — what submissions, seeds, and response
 * columns are built from. */
const stageQuestions = (elements) => elements.filter((el) => !(0, exports.isDisplayBlock)(el));
exports.stageQuestions = stageQuestions;
exports.PREFILL_SOURCES = [
    { id: 'rsvp.companionNames', label: "Companion names — from their RSVP" },
    { id: 'rsvp.companionsWithAllergies', label: "Companions with allergies — from their RSVP" },
    { id: 'rsvp.partyNames', label: "Party names — the guest plus companions, from their RSVP" },
];
/** Reserved top-level keys on stage-lane responses (cdk#962): the guest GET
 * body is flat (field keys at top level), so these ride beside the answers and
 * a field key may never claim them. Mirrors the Lambda's RESERVED_FIELD_KEYS. */
exports.STAGE_RESPONSE_META_KEYS = ['defaults', 'drift'];
/** cdk#1016 (mirror of the Lambda's precedence): companions come from the
 *  core-stage response first — an ARRAY there is an answer, [] included — and
 *  from the legacy rsvp map only when no core list exists. */
const companionList = (guest) => {
    var _a;
    const stages = guest === null || guest === void 0 ? void 0 : guest.stages;
    const core = stages && typeof stages === 'object'
        ? stages.RSVP : undefined;
    const fromCore = core && typeof core === 'object'
        ? core.companions : undefined;
    if (Array.isArray(fromCore))
        return fromCore;
    return (_a = guest === null || guest === void 0 ? void 0 : guest.rsvp) === null || _a === void 0 ? void 0 : _a.companions;
};
const companionEntries = (guest) => {
    const companions = companionList(guest);
    if (!Array.isArray(companions))
        return [];
    const entries = [];
    for (const c of companions) {
        if (typeof c !== 'object' || c === null)
            continue;
        const name = c.name;
        if (typeof name !== 'string' || !name.trim())
            continue;
        const allergies = c.allergies;
        entries.push({ name: name.trim(),
            allergies: typeof allergies === 'string' ? allergies.trim() : '' });
    }
    return entries;
};
const str = (v) => (typeof v === 'string' ? v.trim() : '');
/** Mirror of the Lambda's guest_display_name: row names first, RSVP fallbacks
 * second, empty string when nothing is known. */
const guestDisplayName = (guest) => {
    var _a, _b;
    const fromRow = [str(guest === null || guest === void 0 ? void 0 : guest.firstName), str(guest === null || guest === void 0 ? void 0 : guest.lastName)].filter(Boolean).join(' ');
    if (fromRow)
        return fromRow;
    return str((_a = guest === null || guest === void 0 ? void 0 : guest.rsvp) === null || _a === void 0 ? void 0 : _a.preferredName) || str((_b = guest === null || guest === void 0 ? void 0 : guest.rsvp) === null || _b === void 0 ? void 0 : _b.name);
};
exports.guestDisplayName = guestDisplayName;
const RESOLVERS = {
    'rsvp.companionNames': (g) => companionEntries(g).map((e) => e.name),
    'rsvp.companionsWithAllergies': (g) => companionEntries(g)
        .map((e) => (e.allergies ? `${e.name} (${e.allergies})` : e.name)),
    'rsvp.partyNames': (g) => {
        const name = (0, exports.guestDisplayName)(g);
        const companions = companionEntries(g).map((e) => e.name);
        return name ? [name, ...companions] : companions;
    },
};
/** One registry source's current value from the guest's own row, or undefined
 * when the id is unknown/bare or resolves to nothing. */
const resolvePrefillSource = (id, guest) => {
    var _a;
    const resolved = (_a = RESOLVERS[id]) === null || _a === void 0 ? void 0 : _a.call(RESOLVERS, guest);
    return resolved && resolved.length > 0 ? resolved : undefined;
};
exports.resolvePrefillSource = resolvePrefillSource;
/** Content compare, not representation (mirrors prefill._normalized): lists as
 * stripped multisets — reordering companions is not drift — strings stripped. */
const normalized = (value) => {
    if (Array.isArray(value))
        return JSON.stringify([...value].map((v) => String(v).trim()).sort());
    if (typeof value === 'string')
        return value.trim();
    return value;
};
/** Question keys whose SAVED stage answer differs from its declared registry
 * source (#965 allowance): declared edges only, direction-agnostic. Mirrors
 * the Lambda's drift_keys — the responses grid uses the server's flag; the
 * guest drawer computes the same thing from the roster row it already holds.
 * Display blocks never drift (nothing saved) and are skipped by construction:
 * they carry no `key`. */
const stageDriftKeys = (fields, guest, stagePayload) => {
    const saved = stagePayload !== null && stagePayload !== void 0 ? stagePayload : {};
    const out = [];
    for (const f of fields) {
        if (!f.defaultFrom || !(f.defaultFrom in RESOLVERS))
            continue;
        if (!(f.key in saved))
            continue;
        const current = (0, exports.resolvePrefillSource)(f.defaultFrom, guest);
        if (current === undefined)
            continue;
        if (normalized(saved[f.key]) !== normalized(current))
            out.push(f.key);
    }
    return out;
};
exports.stageDriftKeys = stageDriftKeys;
