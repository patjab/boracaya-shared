// Inter-site / public website page links — NOT API endpoints (those live in
// ApiConstants). Centralized so no app hardcodes a site URL. Add entries as needed.
import { isTestEnv } from './env';

export const SiteUrls = {
    // cdk#500 rebrand: the platform lives on boracaya.com; pdaboracay.com is a
    // legacy 301 into the wedding's event page (cdk#502).
    PUBLIC: 'https://boracaya.com',
    EVENTS_PAGE: 'https://boracaya.com/events',
    // The Valet organizer console, env-aware like ApiConstants: a test page
    // links test Valet, everything else links prod (pda-boracay#119; hosts are
    // the cdk#500/#501 valet.boracaya.com pair, live in both envs).
    VALET: `https://valet${isTestEnv ? '.test' : ''}.boracaya.com`,
} as const;
