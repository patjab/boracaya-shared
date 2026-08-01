/**
 * The parse seam for UNTRUSTED input (cdk#1201), shared by every Boracaya app.
 *
 * Server JSON that no app validated (several config bags are typed `unknown` in
 * this package on purpose — cdk#742) and DOM reads (a `<select>`'s `value` is
 * `string` no matter which options were rendered) land here. The rule is parse,
 * don't assert: a reader states the type it wants and gets a fallback when the
 * value isn't it, so a malformed document can never travel as a well-formed one.
 *
 * App-specific pickers (`nonEmptyStringOr`, `pickedOption`, …) build on these
 * two primitives in each app's own `untrusted` module.
 */
/**
 * View an untrusted value as a keyed record so named readers can pick fields
 * off it. THE one surviving assertion in this lane, and it is unavoidable:
 * `typeof v === 'object'` is as far as TypeScript narrows `unknown`, and there
 * is no way to say "an object whose keys I have not checked yet" without an
 * index signature. Nothing is trusted by doing so — every value read out is
 * still `unknown` and must go through a picker below.
 *
 * Arrays are rejected (CodeRabbit on shore#272): `typeof [] === 'object'`, so
 * without the guard a malformed array config would read as a record keyed by
 * its indices — `asRecord(['Ada'])` -> `{ '0': 'Ada' }` — and hand positional
 * junk to the pickers instead of the documented empty record.
 */
export declare const asRecord: (value: unknown) => Record<string, unknown>;
/** An untrusted value read as a string, verbatim. Non-strings read as the
 *  fallback — never coerced, so `[object Object]` cannot reach a text input. */
export declare const stringOr: (value: unknown, fallback: string) => string;
