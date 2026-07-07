/**
 * The named-env hostmap (cdk#562/#563): hostname -> environment, PROD default.
 * env.ts resolves at module load, so each case imports a FRESH module instance
 * with the location stubbed first.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';

const loadFor = async (hostname?: string) => {
    vi.resetModules();
    if (hostname === undefined) {
        vi.stubGlobal('window', undefined);
    } else {
        vi.stubGlobal('window', { location: { hostname } } as Window & typeof globalThis);
    }
    return await import('./env');
};

afterEach(() => vi.unstubAllGlobals());

describe('env hostmap (cdk#563)', () => {
    it.each([
        ['boracaya.com', 'PROD'],
        ['valet.boracaya.com', 'PROD'],
        ['pdaboracay.com', 'PROD'],
        ['test.boracaya.com', 'TEST'],
        ['valet.test.boracaya.com', 'TEST'],
        ['test.pdaboracay.com', 'TEST'],
        ['www.test.pdaboracay.com', 'TEST'],
        // never fooled by a lookalike suffix on a foreign domain
        ['test.boracaya.com.evil.com', 'PROD'],
    ])('%s -> %s', async (hostname, env) => {
        expect((await loadFor(hostname)).ENV).toBe(env);
    });

    it('no window (SSR / unit-test) resolves PROD', async () => {
        expect((await loadFor(undefined)).ENV).toBe('PROD');
    });
});

describe('site URL builders ride the env + the boracaya identity (cdk#563)', () => {
    it('TEST pages mint test.boracaya.com links', async () => {
        await loadFor('valet.test.boracaya.com');
        const { SiteUrls, guestSiteUrlFor, inviteUrlFor } = await import('./siteUrls');
        expect(SiteUrls.PUBLIC).toBe('https://test.boracaya.com');
        expect(SiteUrls.VALET).toBe('https://valet.test.boracaya.com');
        expect(guestSiteUrlFor('ev-1')).toBe('https://test.boracaya.com/e/ev-1/');
        expect(inviteUrlFor('ev-1', 'abc123')).toBe('https://test.boracaya.com/e/ev-1/?invited=abc123');
    });

    it('PROD pages mint boracaya.com links, identities encoded', async () => {
        await loadFor('valet.boracaya.com');
        const { SiteUrls, inviteUrlFor } = await import('./siteUrls');
        expect(SiteUrls.PUBLIC).toBe('https://boracaya.com');
        expect(inviteUrlFor('e/v?1', 'a&b c?#')).toBe('https://boracaya.com/e/e%2Fv%3F1/?invited=a%26b%20c%3F%23');
    });
});
