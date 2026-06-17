import { describe, it, expect } from 'vitest';
import { ApiConstants } from './api';

/**
 * Contract tests — no network. They lock the *shape* of the endpoint config so a
 * refactor (notably the planned move from raw `*.execute-api…` URLs to stable
 * custom domains like api.pdaboracay.com) can't silently drop, rename, or
 * malform an endpoint.
 *
 * Why these survive the custom-domain switch: they assert the **resource path**
 * (e.g. `/login`), never the host or the `/production` stage prefix. Moving a
 * host or dropping the stage segment leaves the resource path unchanged, so
 * these stay green — but a typo'd or missing path goes red.
 */

// Resource path = pathname minus the API Gateway stage prefix and any query.
// `execute-api` URLs carry `/production/<path>`; custom domains (e.g. the
// already-migrated survey.pdaboracay.com) carry just `/<path>`. Both normalize
// to the same value.
function resourcePath(url: string): string {
    const { pathname } = new URL(url);
    return pathname.replace(/^\/production(?=\/|$)/, '') || '/';
}

// The agreed endpoint inventory (resource paths). Update this deliberately when
// adding/removing an endpoint — that's the point: it forces a conscious change.
const EXPECTED_PATHS: Record<keyof typeof ApiConstants, string> = {
    GET_ALL_INVITES: '/invite',
    GET_INVITE: '/invite',
    CREATE_INVITES_BY_CSV_UPLOAD: '/scramble',
    INCREMENT_COUNT_OF_INVITE_SENT: '/scramble/increment',
    GET_RSVPS: '/rsvp',
    GET_AND_PUT_ADMIN_ADDED_DATA_TO_RSVPS: '/organize',
    GET_PRECHECKINS: '/pda-boracay-precheckins',
    SEND_CODE: '/send-code',
    VERIFY_CODE: '/verify-code',
    GET_SAVE_THE_DATE_RECORDS: '/records',
    SAVE_THE_DATE_RECORD: '/record',
    GUEST_AUTH: '/guest',
    GET_ALL_SURVEYS: '/surveys',
    GET_SURVEY_COUNTS: '/surveys/count',
    GET_IP_ADDRESSES: '/',
    LOGIN: '/login',
    ADMIN_EVENTS: '/events',
    TEMPLATES: '/templates',
    EMAIL_TEMPLATE: '/email-template',
    WISHES: '/wishes',
    EVENTS: '/events',
    SURVEY: '/survey',
    INITIATE_UPLOAD: '/initiate',
    COMPLETE_UPLOAD: '/complete',
    MOMENTS_ADMIN: '/moments',
    MOMENTS_PUBLIC: '/moments/public',
    FACES_CONTROL: '/',
    FACES_BOX: '/',
    MOMENTS_OFFICIAL_MANIFEST: '/uploads/official/manifest.json',
    MOMENTS_OFFICIAL_BOOT: '/uploads/official/_boot.json',
};

const entries = Object.entries(ApiConstants) as [keyof typeof ApiConstants, string][];

describe('ApiConstants — endpoint contract', () => {
    it('has no endpoint without an expected resource path (and vice-versa)', () => {
        expect(Object.keys(ApiConstants).sort()).toEqual(Object.keys(EXPECTED_PATHS).sort());
    });

    it.each(entries)('%s is a valid https:// URL', (_key, url) => {
        const u = new URL(url); // throws if malformed
        expect(u.protocol).toBe('https:');
        expect(u.host).not.toBe('');
    });

    it.each(entries)('%s resolves to its agreed resource path (host-agnostic)', (key, url) => {
        expect(resourcePath(url)).toBe(EXPECTED_PATHS[key]);
    });
});
