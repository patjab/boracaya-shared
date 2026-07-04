import { describe, it, expect } from 'vitest';
import { ApiConstants } from './api';
import { SiteUrls } from './siteUrls';

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
    SET_INVITED_BY: '/invite',
    AUTH_EXCHANGE: '/auth/exchange',
    GET_RSVPS: '/rsvp',
    GET_ALL_RSVPS: '/rsvp',
    GET_ALL_PRECHECKINS: '/pda-boracay-precheckins',
    GET_PRECHECKINS: '/pda-boracay-precheckins',
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

describe('SiteUrls — site/page links', () => {
    it.each(Object.entries(SiteUrls) as [string, string][])('%s is a valid https:// URL', (_key, url) => {
        const u = new URL(url);
        expect(u.protocol).toBe('https:');
        expect(u.host).not.toBe('');
    });
});

// ── Event-scoped admin lanes (cdk#396 / admin#101) ────────────────────────────
// Lock each builder's resource path (host-independent, like the blocks above) and
// the URI-encoding of caller-supplied segments — the URL names the target event,
// so a raw '/' or '?' in an id must never restructure the path.
import { AdminEventApi } from './api';

describe('AdminEventApi contract', () => {
    const EXPECTED_EVENT_PATHS: Record<string, string> = {
        config: '/events/e-1',
        pagesOrder: '/events/e-1/pages/order',
        about: '/events/e-1/about',
        rsvps: '/events/e-1/rsvp',
        invites: '/events/e-1/invite',
        scramble: '/events/e-1/scramble',
        scrambleIncrement: '/events/e-1/scramble/increment',
        precheckins: '/events/e-1/precheckins',
        moments: '/events/e-1/moments',
        momentsPublic: '/events/e-1/moments/public',
        templates: '/events/e-1/templates',
        emailTemplate: '/events/e-1/email-template',
        surveys: '/events/e-1/surveys',
        surveyCounts: '/events/e-1/surveys/count',
    };

    it('covers every single-argument builder', () => {
        const singleArg = Object.keys(AdminEventApi).filter(
            (k) => !['precheckinByEmail', 'template'].includes(k));
        expect(singleArg.sort()).toEqual(Object.keys(EXPECTED_EVENT_PATHS).sort());
    });

    it.each(Object.entries(EXPECTED_EVENT_PATHS))('%s -> %s', (key, path) => {
        const url = (AdminEventApi as Record<string, (id: string) => string>)[key]('e-1');
        expect(resourcePath(url)).toBe(path);
        expect(new URL(url).hostname).toMatch(/^admin-api\./);
    });

    it('two-argument builders place both encoded segments', () => {
        expect(resourcePath(AdminEventApi.template('e-1', 't 1'))).toBe('/events/e-1/templates/t%201');
        expect(resourcePath(AdminEventApi.precheckinByEmail('e-1', 'a+b@x.co')))
            .toBe('/events/e-1/precheckins/a%2Bb%40x.co');
    });

    it('URI-encodes hostile eventIds instead of restructuring the path', () => {
        expect(resourcePath(AdminEventApi.rsvps('a/b?c'))).toBe('/events/a%2Fb%3Fc/rsvp');
    });
});
