// Which hosts may receive the organizer's Google ID token (shared#199, finding 3
// of valet#562). getJson / sendJson / useApi attached it to EVERY url, so a
// misconfigured base, a url built from server data or a third-party host got the
// real token — not a scoped session — with the authority of every event that
// organizer administers. valet#568 narrowed valet's own fetch patch, but these
// paths set Authorization before that patch sees the request, so it could not help.
//
// The allowlist is the EXACT set of service hosts api.ts / publicApi.ts build,
// across prod and testing. Deliberately excluded: frontends and the moments CDN.
// The faces box hosts (faces-control and faces on pdaboracay.com) left with the
// box (shared#203). Keep in lockstep with api.ts / publicApi.ts: a too-narrow
// list ships tokenless requests that 401.
const API_SERVICE_HOSTS = {
    'boracaya.com': ['valet-api', 'public-api', 'reservations-api', 'share-api', 'moments-api', 'faces-api'],
};
// The env marker api.ts inserts between the service label and the apex:
// none for prod, 'test' for the testing mirror (valet-api.test.boracaya.com).
const ENV_MARKERS = ['test'];
/**
 * True only for a first-party API host. Matching is on the PARSED hostname,
 * decomposed exactly — never a substring — so look-alikes
 * (`valet-api.boracaya.com.evil.com`, `evil-valet-api.boracaya.com`), bare
 * apexes, the retired faces hosts, non-https urls and relative urls (the page's own
 * origin, never an API) all return false.
 */
export function isPlatformApiUrl(url) {
    let parsed;
    try {
        parsed = new URL(url);
    }
    catch (_a) {
        return false;
    }
    if (parsed.protocol !== 'https:')
        return false;
    const host = parsed.hostname.toLowerCase();
    for (const apex of Object.keys(API_SERVICE_HOSTS)) {
        const suffix = `.${apex}`;
        if (!host.endsWith(suffix))
            continue;
        const [service, ...markers] = host.slice(0, -suffix.length).split('.');
        if (!API_SERVICE_HOSTS[apex].includes(service))
            continue;
        if (markers.length === 0)
            return true;
        if (markers.length === 1 && ENV_MARKERS.includes(markers[0]))
            return true;
    }
    return false;
}
