"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.STAGE_RESPONSE_META_KEYS = exports.PREFILL_SOURCES = void 0;
exports.PREFILL_SOURCES = [
    { id: 'rsvp.companionNames', label: "Companion names — from their RSVP" },
    { id: 'rsvp.companionsWithAllergies', label: "Companions with allergies — from their RSVP" },
];
/** Reserved top-level keys on stage-lane responses (cdk#962): the guest GET
 * body is flat (field keys at top level), so these ride beside the answers and
 * a field key may never claim them. Mirrors the Lambda's RESERVED_FIELD_KEYS. */
exports.STAGE_RESPONSE_META_KEYS = ['defaults', 'drift'];
