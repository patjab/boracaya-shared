"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EVENT_CONFIG_WRITE_ERROR_CODES = void 0;
/** Stable backend codes for field-ownership refusals. */
exports.EVENT_CONFIG_WRITE_ERROR_CODES = {
    unknownField: 'UNKNOWN_EVENT_FIELD',
    mixedOwners: 'MIXED_EVENT_FIELD_OWNERS',
    protectedField: 'PROTECTED_EVENT_FIELD',
};
