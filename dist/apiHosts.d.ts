/**
 * True only for a first-party API host. Matching is on the PARSED hostname,
 * decomposed exactly — never a substring — so look-alikes
 * (`valet-api.boracaya.com.evil.com`, `evil-valet-api.boracaya.com`), bare
 * apexes, the retired faces hosts, non-https urls and relative urls (the page's own
 * origin, never an API) all return false.
 */
export declare function isPlatformApiUrl(url: string): boolean;
