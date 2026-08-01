/**
 * Stable mutation-security contracts (#134).
 *
 * These limits are product policy, not API Gateway's transport ceiling. Keep
 * them checked in so browser validation, Lambda enforcement, and E2E assertions
 * describe the same boundary. The backend remains authoritative.
 */
export const MUTATION_LIMITS = {
    bodyBytes: 16 * 1024,
    openRsvpNameChars: 80,
    emailChars: 254,
    companions: 20,
    companionNameBytes: 200,
    companionAllergiesBytes: 1000,
    pulseAuthorChars: 80,
    pulseContentChars: 2000,
    pulseContentBytes: 4 * 1024,
    pulseGroupChars: 40,
    surveyFields: 40,
    surveyStringBytes: 1000,
    surveyDepth: 4,
    chooserIdChars: 128,
};
export const MUTATION_SECURITY_ERROR_CODES = [
    'INVALID_REQUEST_BODY',
    'PAYLOAD_TOO_LARGE',
    'FIELD_LIMIT_EXCEEDED',
    'RATE_LIMITED',
    'FEATURE_DISABLED',
    'UPLOAD_QUOTA_EXCEEDED',
    'UPLOAD_TYPE_INVALID',
    'IDEMPOTENCY_KEY_REQUIRED',
    'IDEMPOTENCY_CONFLICT',
];
/** Browser-safe interpretation of a Retry-After header (delta-seconds form). */
export const retryAfterSeconds = (value) => {
    if (!value || !/^\d+$/.test(value.trim()))
        return undefined;
    const seconds = Number(value);
    return Number.isSafeInteger(seconds) && seconds >= 0 ? seconds : undefined;
};
