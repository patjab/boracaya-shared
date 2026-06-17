import { describe, it, expect } from 'vitest';
import { ApiConstants } from './api';

/**
 * Live smoke tests — confirm every endpoint the UIs reference is actually a
 * reachable, wired API route. Run with `npm run test:smoke` (needs network).
 *
 * SAFETY — these CANNOT mutate data:
 *   They send ONLY HTTP `OPTIONS` (the CORS preflight). API Gateway answers
 *   preflight from its own CORS layer and NEVER invokes the backing Lambda, so
 *   no GET/POST/PUT/PATCH/DELETE handler runs — nothing is read or written,
 *   whatever the endpoint's real method is. The actual verb is never sent.
 *
 * Why OPTIONS is also the right "is this endpoint good?" probe:
 *   - real wired route   -> 2xx (200 on REST APIs, 204 on HTTP-API/custom domain)
 *   - dead / typo'd path -> 403 MissingAuthenticationToken
 *   - wrong host         -> DNS/TLS/connection failure (fetch rejects)
 *
 * Why it survives the custom-domain switch: it reads the URLs from ApiConstants
 * and asserts only "OPTIONS returns 2xx". After the hosts change to
 * api.pdaboracay.com it retargets automatically; it stays green iff the new
 * base-path mappings are wired correctly — which is exactly the safety net.
 */

const METHOD = 'OPTIONS' as const; // the ONLY method this suite may ever send
const TIMEOUT_MS = 12_000;

// Preflight targets a path, not a query — strip any `?…` from the constant.
function preflightUrl(url: string): string {
    const u = new URL(url);
    u.search = '';
    return u.toString();
}

async function optionsStatus(url: string): Promise<number> {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
        const res = await fetch(preflightUrl(url), {
            method: METHOD,
            headers: {
                // mimic a browser CORS preflight
                Origin: 'https://pdaboracay.com',
                'Access-Control-Request-Method': 'GET',
            },
            signal: ctrl.signal,
        });
        return res.status;
    } finally {
        clearTimeout(t);
    }
}

// Endpoints that can't be meaningfully OPTIONS-probed from here:
//  - FACES_BOX is an on-demand instance that auto-terminates when idle, so it
//    is usually off (a 000/connection failure is expected, not a defect).
// Its existence/shape is still covered by the hermetic contract test.
const SKIP_LIVE = new Set<keyof typeof ApiConstants>(['FACES_BOX']);

const entries = (Object.entries(ApiConstants) as [keyof typeof ApiConstants, string][])
    .filter(([key]) => !SKIP_LIVE.has(key));

describe('ApiConstants — live endpoint reachability (OPTIONS only, non-mutating)', () => {
    // Guard against a future edit accidentally turning this into a real call.
    it('only ever issues OPTIONS', () => {
        expect(METHOD).toBe('OPTIONS');
    });

    it.concurrent.each(entries)(
        '%s answers CORS preflight with 2xx (route exists & is wired)',
        async (_key, url) => {
            const status = await optionsStatus(url);
            expect(
                status,
                `OPTIONS ${preflightUrl(url)} returned ${status} — a dead/mis-mapped route returns 403, a bad host fails to connect`,
            ).toBeGreaterThanOrEqual(200);
            expect(status).toBeLessThan(300);
        },
        TIMEOUT_MS + 3_000,
    );
});
