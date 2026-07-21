"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.interpolate = exports.lookup = void 0;
const untrusted_1 = require("./untrusted");
/**
 * Walk a dotted key to its catalog leaf, against the catalog `root` the caller
 * passes in (each app owns its own catalog). Reads through the untrusted seam
 * because the walk is by string: an app's `CatalogKey` proves at COMPILE time
 * that the path exists, so the runtime fallback is unreachable through the typed
 * API — it exists so a bad key from an untyped edge (a cast, a future JSON
 * catalog, a key built at runtime) renders its own key instead of `undefined`,
 * the standard i18n missing-key behavior and far easier to spot on screen.
 */
const lookup = (root, key) => (0, untrusted_1.stringOr)(key.split('.').reduce((node, part) => (0, untrusted_1.asRecord)(node)[part], root), key);
exports.lookup = lookup;
/**
 * Minimal `{name}` substitution — deliberately the whole feature set. An
 * unknown placeholder is left verbatim rather than blanked, so a missing param
 * shows up as `{name}` on screen instead of silently disappearing.
 *
 * No plurals, no number/date formatting: those need `Intl` and locale data,
 * which is work the second locale pays for. Exported so substitution is pinned
 * against arbitrary raw strings (a test about BEHAVIOR, not about copy) and so
 * each app's `Trans` can split a catalog value on its markup tags and
 * substitute into each text run — same rule, applied per chunk.
 */
const interpolate = (raw, params) => raw.replace(/\{(\w+)\}/g, (placeholder, name) => {
    const value = params[name];
    return value === undefined ? placeholder : String(value);
});
exports.interpolate = interpolate;
