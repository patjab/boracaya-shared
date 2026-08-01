/**
 * Stable mutation-security contracts (#134).
 *
 * These limits are product policy, not API Gateway's transport ceiling. Keep
 * them checked in so browser validation, Lambda enforcement, and E2E assertions
 * describe the same boundary. The backend remains authoritative.
 */
export declare const MUTATION_LIMITS: {
    readonly bodyBytes: number;
    readonly openRsvpNameChars: 80;
    readonly emailChars: 254;
    readonly companions: 20;
    readonly companionNameBytes: 200;
    readonly companionAllergiesBytes: 1000;
    readonly pulseAuthorChars: 80;
    readonly pulseContentChars: 2000;
    readonly pulseContentBytes: number;
    readonly pulseGroupChars: 40;
    readonly surveyFields: 40;
    readonly surveyStringBytes: 1000;
    readonly surveyDepth: 4;
    readonly chooserIdChars: 128;
};
export declare const MUTATION_SECURITY_ERROR_CODES: readonly ["INVALID_REQUEST_BODY", "PAYLOAD_TOO_LARGE", "FIELD_LIMIT_EXCEEDED", "RATE_LIMITED", "FEATURE_DISABLED", "UPLOAD_QUOTA_EXCEEDED", "UPLOAD_TYPE_INVALID", "IDEMPOTENCY_KEY_REQUIRED", "IDEMPOTENCY_CONFLICT"];
export type MutationSecurityErrorCode = typeof MUTATION_SECURITY_ERROR_CODES[number];
export interface MutationSecurityError {
    code: MutationSecurityErrorCode;
    error: string;
    /** Present for RATE_LIMITED; mirrored in the Retry-After response header. */
    retryAfterSeconds?: number;
}
/** Browser-safe interpretation of a Retry-After header (delta-seconds form). */
export declare const retryAfterSeconds: (value: string | null | undefined) => number | undefined;
export type MutationIdentitySource = 'anonymous' | 'guest-token' | 'organizer-token' | 'identity-token' | 'service-token';
export type MutationTenantSource = 'path' | 'authorizer' | 'none';
export type MutationCostClass = 'standard' | 'email' | 'upload' | 'checkout' | 'faces';
export interface MutationRouteSecurity {
    identitySource: MutationIdentitySource;
    tenantSource: MutationTenantSource;
    bodyLimitBytes: number;
    rateClass: string;
    idempotency: 'none' | 'optional' | 'required';
    concurrency: 'last-write-wins' | 'conditional' | 'transactional' | 'append-only';
    auditEvent: string;
    costClass: MutationCostClass;
}
