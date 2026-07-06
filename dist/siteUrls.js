"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SiteUrls = void 0;
// Inter-site / public website page links — NOT API endpoints (those live in
// ApiConstants). Centralized so no app hardcodes a site URL. Add entries as needed.
const env_1 = require("./env");
exports.SiteUrls = {
    // cdk#500 rebrand: the platform lives on boracaya.com; pdaboracay.com is a
    // legacy 301 into the wedding's event page (cdk#502).
    PUBLIC: 'https://boracaya.com',
    EVENTS_PAGE: 'https://boracaya.com/events',
    // The Valet organizer console, env-aware like ApiConstants: a test page
    // links test Valet, everything else links prod (pda-boracay#119; hosts are
    // the cdk#500/#501 valet.boracaya.com pair, live in both envs).
    VALET: `https://valet${env_1.isTestEnv ? '.test' : ''}.boracaya.com`,
};
