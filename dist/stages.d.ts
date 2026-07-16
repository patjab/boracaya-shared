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
export declare const PREFILL_SOURCES: readonly PrefillSource[];
/** Reserved top-level keys on stage-lane responses (cdk#962): the guest GET
 * body is flat (field keys at top level), so these ride beside the answers and
 * a field key may never claim them. Mirrors the Lambda's RESERVED_FIELD_KEYS. */
export declare const STAGE_RESPONSE_META_KEYS: readonly ["defaults", "drift"];
