"use strict";
/**
 * Typed reads for values a caller has ALREADY established are present
 * (cdk#1201). These replace `as string` / `as number` on lookup APIs whose
 * signature must say `T | undefined` even where the call site proved otherwise
 * — e.g. a Map keyed from the very list it was built from, or an optional
 * field an earlier `filter` proved.
 *
 * Why a helper and not a cast: a cast makes the compiler stop checking and,
 * when the invariant is one day broken, the wrong value travels silently.
 * These throw at the point the invariant breaks instead. Why not `!`: same
 * silence, worse — it is invisible in review.
 *
 * The failure arm is unreachable by construction at every current call site,
 * which is exactly why it lives HERE: one tested branch, not one dead `??`
 * arm per call site (the cdk#1147 coverage rule).
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.requiredString = exports.requiredEntry = exports.required = void 0;
/** A value the caller established is present. Throws if the invariant broke. */
const required = (value, what) => {
    if (value === null || value === undefined) {
        throw new Error(`Expected ${what} to be present`);
    }
    return value;
};
exports.required = required;
/** A Map entry the caller established is present (see `required`). */
const requiredEntry = (map, key, what) => (0, exports.required)(map.get(key), what);
exports.requiredEntry = requiredEntry;
/** A value the caller established is a string — e.g. a form field seeded as
 *  text by its own initializer, or an address a `filter(g => !!g.email)`
 *  upstream already proved. Throws rather than letting a non-string travel as
 *  one. */
const requiredString = (value, what) => {
    if (typeof value !== 'string') {
        throw new Error(`Expected ${what} to be a string`);
    }
    return value;
};
exports.requiredString = requiredString;
