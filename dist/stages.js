"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.stageDriftKeys = exports.resolvePrefillSource = exports.STAGE_RESPONSE_META_KEYS = exports.PREFILL_SOURCES = void 0;
exports.PREFILL_SOURCES = [
    { id: 'rsvp.companionNames', label: "Companion names — from their RSVP" },
    { id: 'rsvp.companionsWithAllergies', label: "Companions with allergies — from their RSVP" },
];
/** Reserved top-level keys on stage-lane responses (cdk#962): the guest GET
 * body is flat (field keys at top level), so these ride beside the answers and
 * a field key may never claim them. Mirrors the Lambda's RESERVED_FIELD_KEYS. */
exports.STAGE_RESPONSE_META_KEYS = ['defaults', 'drift'];
const companionEntries = (rsvp) => {
    const companions = rsvp === null || rsvp === void 0 ? void 0 : rsvp.companions;
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
const RESOLVERS = {
    'rsvp.companionNames': (rsvp) => companionEntries(rsvp).map((e) => e.name),
    'rsvp.companionsWithAllergies': (rsvp) => companionEntries(rsvp)
        .map((e) => (e.allergies ? `${e.name} (${e.allergies})` : e.name)),
};
/** One registry source's current value from the guest's own rsvp map, or
 * undefined when the id is unknown/bare or resolves to nothing. */
const resolvePrefillSource = (id, rsvp) => {
    var _a;
    const resolved = (_a = RESOLVERS[id]) === null || _a === void 0 ? void 0 : _a.call(RESOLVERS, rsvp);
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
/** Field keys whose SAVED stage answer differs from its declared registry
 * source (#965 allowance): declared edges only, direction-agnostic. Mirrors
 * the Lambda's drift_keys — the responses grid uses the server's flag; the
 * guest drawer computes the same thing from the roster row it already holds. */
const stageDriftKeys = (fields, rsvp, stagePayload) => {
    const saved = stagePayload !== null && stagePayload !== void 0 ? stagePayload : {};
    const out = [];
    for (const f of fields) {
        if (!f.defaultFrom || !(f.defaultFrom in RESOLVERS))
            continue;
        if (!(f.key in saved))
            continue;
        const current = (0, exports.resolvePrefillSource)(f.defaultFrom, rsvp);
        if (current === undefined)
            continue;
        if (normalized(saved[f.key]) !== normalized(current))
            out.push(f.key);
    }
    return out;
};
exports.stageDriftKeys = stageDriftKeys;
