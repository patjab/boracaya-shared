import { describe, it, expect, vi } from 'vitest';
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
    CREATE_INVITES_BY_CSV_UPLOAD: '/scramble',
    INCREMENT_COUNT_OF_INVITE_SENT: '/scramble/increment',
    SET_INVITED_BY: '/invite',
    GET_ALL_RSVPS: '/rsvp',
    GET_SAVE_THE_DATE_RECORDS: '/records',
    SAVE_THE_DATE_RECORD: '/record',
    GUEST_AUTH: '/guest',
    GET_IP_ADDRESSES: '/',
    LOGIN: '/login',
    ADMIN_EVENTS: '/events',
    TEMPLATES: '/templates',
    EMAIL_TEMPLATE: '/email-template',
    EVENTS: '/events',
    DISCOVER: '/discover',
    MOMENTS_ADMIN: '/moments',
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

// ── SiteUrls.VALET — env-aware console link (pda-boracay#119) ─────────────────
// The env flag is computed at module load, so each case re-imports siteUrls with
// a stubbed window. Locks the rule a hand-rolled app copy broke: a page on
// EITHER test host links test Valet; everything else (incl. no-window) links prod.
describe('SiteUrls.VALET environment selection', () => {
    it('resolves prod Valet where window is absent (Node/SSR)', () => {
        expect(SiteUrls.VALET).toBe('https://valet.boracaya.com');
    });

    const valetFor = async (hostname: string): Promise<string> => {
        vi.resetModules();
        vi.stubGlobal('window', { location: { hostname } });
        try {
            return (await import('./siteUrls')).SiteUrls.VALET;
        } finally {
            vi.unstubAllGlobals();
        }
    };

    it.each(['test.pdaboracay.com', 'test.boracaya.com', 'www.test.boracaya.com'])(
        'a page on %s links test Valet', async (host) => {
            expect(await valetFor(host)).toBe('https://valet.test.boracaya.com');
        });

    it.each(['boracaya.com', 'pdaboracay.com', 'localhost'])(
        'a page on %s links prod Valet', async (host) => {
            expect(await valetFor(host)).toBe('https://valet.boracaya.com');
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
        stages: '/events/e-1/stages',
        assets: '/events/e-1/assets',
        moments: '/events/e-1/moments',
        momentsPublic: '/events/e-1/moments/public',
        templates: '/events/e-1/templates',
        emailTemplate: '/events/e-1/email-template',
        surveys: '/events/e-1/surveys',
        surveyCounts: '/events/e-1/surveys/count',
    };

    it('covers every single-argument builder', () => {
        const singleArg = Object.keys(AdminEventApi).filter(
            (k) => !['template', 'stage', 'stageResponses', 'stageResponse'].includes(k));
        expect(singleArg.sort()).toEqual(Object.keys(EXPECTED_EVENT_PATHS).sort());
    });

    it.each(Object.entries(EXPECTED_EVENT_PATHS))('%s -> %s', (key, path) => {
        const url = (AdminEventApi as Record<string, (id: string) => string>)[key]('e-1');
        expect(resourcePath(url)).toBe(path);
        expect(new URL(url).hostname).toMatch(/^valet-api\./);
    });

    it('multi-argument builders place every encoded segment', () => {
        expect(resourcePath(AdminEventApi.template('e-1', 't 1'))).toBe('/events/e-1/templates/t%201');
        expect(resourcePath(AdminEventApi.stage('e-1', 'PRE CHECK')))
            .toBe('/events/e-1/stages/PRE%20CHECK');
        expect(resourcePath(AdminEventApi.stageResponses('e-1', 'PRECHECKIN')))
            .toBe('/events/e-1/stages/PRECHECKIN/responses');
        expect(resourcePath(AdminEventApi.stageResponse('e-1', 'PRECHECKIN', 'u/1')))
            .toBe('/events/e-1/stages/PRECHECKIN/responses/u%2F1');
    });

    it('URI-encodes hostile eventIds instead of restructuring the path', () => {
        expect(resourcePath(AdminEventApi.rsvps('a/b?c'))).toBe('/events/a%2Fb%3Fc/rsvp');
    });
});

// ── Event-scoped guest/public lanes (cdk#427 / #386 SI-5) ─────────────────────
// Same contract style: lock each builder's resource path and its target API host,
// and the URI-encoding of the caller-supplied eventId.
import { GuestEventApi } from './api';

describe('GuestEventApi contract', () => {
    // builder -> [resource path for eventId 'e-1', expected host prefix]
    const EXPECTED: Record<keyof typeof GuestEventApi, [string, RegExp]> = {
        exchange: ['/events/e-1/auth/exchange', /^public-api\./],
        openRsvp: ['/events/e-1/rsvp/open', /^public-api\./],
        claim: ['/events/e-1/auth/claim', /^public-api\./],
        invite: ['/events/e-1/invite', /^public-api\./],
        momentsPublic: ['/events/e-1/moments/public', /^public-api\./],
        wishes: ['/events/e-1/wishes', /^public-api\./],
        survey: ['/events/e-1/survey', /^public-api\./],
        rsvp: ['/events/e-1/rsvp', /^reservations-api\./],
        // Node (no window) resolves the prod host: share-api fronts the moments lambda.
        initiateUpload: ['/events/e-1/initiate', /^share-api\./],
        completeUpload: ['/events/e-1/complete', /^share-api\./],
    };

    it('covers every builder', () => {
        expect(Object.keys(GuestEventApi).sort())
            .toEqual([...Object.keys(EXPECTED), 'stage'].sort());
    });

    it.each(Object.entries(EXPECTED))('%s -> %s', (key, [path, hostRe]) => {
        const url = (GuestEventApi as Record<string, (id: string) => string>)[key]('e-1');
        expect(resourcePath(url)).toBe(path);
        expect(new URL(url).hostname).toMatch(hostRe);
    });

    it('URI-encodes hostile eventIds instead of restructuring the path', () => {
        expect(resourcePath(GuestEventApi.rsvp('a/b?c'))).toBe('/events/a%2Fb%3Fc/rsvp');
    });

    it('stage submission builder places both encoded segments (cdk#513)', () => {
        const url = GuestEventApi.stage('e-1', 'PRE CHECK');
        expect(resourcePath(url)).toBe('/events/e-1/stages/PRE%20CHECK');
        expect(new URL(url).hostname).toMatch(/^reservations-api\./);
    });
});

// ── Account/registration lane (cdk#387, decision cdk#464) ─────────────────────
// Identity-level admin-api endpoints (no eventId): lock the resource paths and
// the admin-api host, same style as the blocks above.
import { AccountApi } from './api';

describe('AccountApi contract', () => {
    const EXPECTED: Record<keyof typeof AccountApi, string> = {
        me: '/accounts/me',
        register: '/accounts',
    };

    it('covers every endpoint', () => {
        expect(Object.keys(AccountApi).sort()).toEqual(Object.keys(EXPECTED).sort());
    });

    it.each(Object.entries(EXPECTED))('%s -> %s', (key, path) => {
        const url = AccountApi[key as keyof typeof AccountApi];
        expect(resourcePath(url)).toBe(path);
        expect(new URL(url).hostname).toMatch(/^valet-api\./);
    });
});
