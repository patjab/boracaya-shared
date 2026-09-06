import type { StageField, StageSubField } from './stages';

/**
 * Does a STORED answer still fit its question's CURRENT declared type?
 *
 * ONE predicate for the whole platform (valet#670). The authority is the
 * stages Lambda's `validate_submission` / `_check_group_value` — the validator
 * a re-submitting guest will actually meet — and this mirrors its TYPE arms.
 * It used to live twice (shore's `stageValues.ts`, valet's `fitsFieldType.ts`)
 * and the two had already drifted on `list` and on unknown types; the whole
 * class of bug here is a client disagreeing with the server about what a valid
 * answer is, so the rule lives once, next to the stage schema it judges.
 *
 * Two readers, one line: "CAN THE GUEST SEE IT?", not "would the server take
 * it".
 *
 *  - Shore (guest seeding, shore#326): a stored answer that does not fit is
 *    NOT seeded into the form — a `'5J 108'` string under a now-`number`
 *    question renders an `<input type="number">` the browser shows EMPTY while
 *    the string is still in state, so submit earns a field-level 400 the guest
 *    can see nothing wrong with.
 *  - Valet (restyle warning valet#669, responses grid valet#670): an answer that
 *    does not fit is an ORPHAN — flagged to the host, never deleted or
 *    converted.
 *
 * Shape only. Length caps (`maxLength`, list bounds, `maxEntries`) are
 * validation LIMITS, not a fit a restyle can break: the field shows the value
 * and the guest can trim it, so dropping it would destroy an answer they can
 * still see and fix — the same harm pointed backwards. `required` is not a fit
 * either.
 */

const isPrimitive = (value: unknown): value is string | number | boolean =>
    typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';

/** The Lambda's DATE_RE, mirrored. */
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * A real calendar day, not merely the shape. `Date.parse` is not that test on
 * its own: it NORMALIZES an over-range day rather than rejecting it —
 * 2026-02-30 parses as 2026-03-02, 2026-04-31 as 2026-05-01, 2026-02-29 in a
 * non-leap year as 2026-03-01; only a syntactically impossible field (month 13)
 * comes back NaN. So the parse has to ROUND-TRIP: if the date it produces is
 * not the date it was given, the input names a day that does not exist, and no
 * `<input type="date">` can show it. Python's `date.fromisoformat`, which the
 * Lambda uses, rejects all of these outright.
 *
 * Year zero is the other divergence: JavaScript has an astronomical year 0 and
 * round-trips `0000-01-01` happily, while `date.fromisoformat` rejects it
 * ("year 0 is out of range"). `\d{4}` spans 0000-9999 and Python accepts
 * 1-9999, so year 0 is the whole of the gap.
 */
const isRealIsoDate = (value: unknown): boolean => {
    if (typeof value !== 'string' || !ISO_DATE.test(value)) return false;
    if (value.startsWith('0000-')) return false;
    const parsed = Date.parse(`${value}T00:00:00Z`);
    return !Number.isNaN(parsed) && new Date(parsed).toISOString().slice(0, 10) === value;
};

/**
 * The arms a question and a sub-field share. `options` is read off the field
 * for `select`; the group arm lives in `fitsFieldType` because sub-fields may
 * not nest (cdk#1011).
 */
const fitsSimpleType = (
    field: { type: string; options?: string[] },
    value: unknown,
): boolean => {
    switch (field.type) {
        case 'text':
        case 'multiline':
            return typeof value === 'string';
        // The Lambda takes int/Decimal and explicitly refuses bools; on the
        // wire both are JSON numbers, so a finite JS number is the whole shape.
        case 'number':
            return typeof value === 'number' && Number.isFinite(value);
        case 'boolean':
            return typeof value === 'boolean';
        // MEMBERSHIP, not string-ness: dropping the option a guest chose is the
        // restyle this arm exists to catch, and a select with no options yet
        // (the moment after a restyle to select) fits nothing.
        case 'select':
            return typeof value === 'string' && (field.options ?? []).includes(value);
        case 'date':
            return isRealIsoDate(value);
        // KEEP a value typed outside the known vocabulary. Definitions are
        // server data, so the union is a compile-time claim rather than a
        // runtime guarantee, and the directions are not symmetric: keeping what
        // this cannot judge costs a validation error the guest can see, while
        // dropping it destroys an answer they gave.
        default:
            return true;
    }
};

/**
 * One repeating-group entry against its group's declared sub-fields, the way
 * `_check_group_value` reads it: a flat record of primitives (an explicit
 * `null` is absence, exactly like the top-level null rule — CodeRabbit on
 * cdk#1021), and every PRESENT declared sub-field value fits that sub-field's
 * type — so restyling a sub-field from `text` to `number`, or dropping the
 * `select` option a sub-field answer uses, is seen one level down too (the gap
 * valet#669 pinned and left for this consolidation).
 *
 * Undeclared keys are NOT judged here. The Lambda rejects them on submit, but
 * a sub-field the host dropped leaves its stored value invisible to the guest
 * and harmless on re-submit only once the client re-seeds without it — shore's
 * seeding lane already keeps only declared sub-fields, so flagging the entry
 * for it would orphan whole entries over a value nobody can see.
 */
const fitsEntry = (subFields: ReadonlyArray<StageSubField>, entry: unknown): boolean => {
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) return false;
    const record = entry as Record<string, unknown>;
    if (!Object.values(record).every((v) => v === null || isPrimitive(v))) return false;
    return subFields.every((sub) => {
        const v = record[sub.key];
        return v === undefined || v === null || fitsSimpleType(sub, v);
    });
};

export const fitsFieldType = (field: StageField, value: unknown): boolean => {
    switch (field.type) {
        // Non-blank strings, as the Lambda reads a list ("a list of up to N
        // non-blank short strings"); the empty list is a fit — `required` is
        // the rule that refuses it, and that is not a shape.
        case 'list':
            return Array.isArray(value)
                && value.every((v) => typeof v === 'string' && v.trim() !== '');
        case 'repeatingGroup':
            return Array.isArray(value)
                && value.every((entry) => fitsEntry(field.subFields ?? [], entry));
        default:
            return fitsSimpleType(field, value);
    }
};
