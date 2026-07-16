/**
 * Prefill-source registry menu (cdk#962).
 *
 * A custom-stage field may declare `defaultFrom` — where its value starts from
 * on a fresh guest form. Sources are DATA, not code: the resolvers (flattening
 * functions with full access to the guest row) live server-side in the stages
 * Lambda; this constant is the {id, label} MENU the Valet picker renders, so
 * hosts choose from human labels and never type an identifier. The Lambda
 * validates a saved `defaultFrom` against these ids (bare un-namespaced ids
 * remain valid too — they name event-config keys, the original cdk#953 lane).
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
export interface PrefillSource {
    /** Namespaced registry id stored in a field's `defaultFrom`. */
    id: string;
    /** Host-facing label shown in the Valet "Starts as…" picker. */
    label: string;
}

export const PREFILL_SOURCES: readonly PrefillSource[] = [
    { id: 'rsvp.companionNames', label: "Companion names — from their RSVP" },
    { id: 'rsvp.companionsWithAllergies', label: "Companions with allergies — from their RSVP" },
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
 * Valet guest drawer reads the roster row, which carries rsvp + stages).
 */
type CompanionEntry = { name: string; allergies: string };

const companionEntries = (rsvp: Record<string, unknown> | undefined): CompanionEntry[] => {
    const companions = rsvp?.companions;
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

const RESOLVERS: Record<string, (rsvp: Record<string, unknown> | undefined) => string[]> = {
    'rsvp.companionNames': (rsvp) => companionEntries(rsvp).map((e) => e.name),
    'rsvp.companionsWithAllergies': (rsvp) => companionEntries(rsvp)
        .map((e) => (e.allergies ? `${e.name} (${e.allergies})` : e.name)),
};

/** One registry source's current value from the guest's own rsvp map, or
 * undefined when the id is unknown/bare or resolves to nothing. */
export const resolvePrefillSource = (
    id: string, rsvp: Record<string, unknown> | undefined,
): string[] | undefined => {
    const resolved = RESOLVERS[id]?.(rsvp);
    return resolved && resolved.length > 0 ? resolved : undefined;
};

/** Content compare, not representation (mirrors prefill._normalized): lists as
 * stripped multisets — reordering companions is not drift — strings stripped. */
const normalized = (value: unknown): unknown => {
    if (Array.isArray(value)) return JSON.stringify([...value].map((v) => String(v).trim()).sort());
    if (typeof value === 'string') return value.trim();
    return value;
};

/** Field keys whose SAVED stage answer differs from its declared registry
 * source (#965 allowance): declared edges only, direction-agnostic. Mirrors
 * the Lambda's drift_keys — the responses grid uses the server's flag; the
 * guest drawer computes the same thing from the roster row it already holds. */
export const stageDriftKeys = (
    fields: ReadonlyArray<{ key: string; defaultFrom?: string }>,
    rsvp: Record<string, unknown> | undefined,
    stagePayload: Record<string, unknown> | undefined,
): string[] => {
    const saved = stagePayload ?? {};
    const out: string[] = [];
    for (const f of fields) {
        if (!f.defaultFrom || !(f.defaultFrom in RESOLVERS)) continue;
        if (!(f.key in saved)) continue;
        const current = resolvePrefillSource(f.defaultFrom, rsvp);
        if (current === undefined) continue;
        if (normalized(saved[f.key]) !== normalized(current)) out.push(f.key);
    }
    return out;
};
