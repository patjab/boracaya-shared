"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SiteUrls = void 0;
// Inter-site / public website page links — NOT API endpoints (those live in
// ApiConstants). Centralized so no app hardcodes a site URL. Add entries as needed.
exports.SiteUrls = {
    // cdk#500 rebrand: the platform lives on boracaya.com; pdaboracay.com is a
    // legacy 301 into the wedding's event page (cdk#502).
    PUBLIC: 'https://boracaya.com',
    EVENTS_PAGE: 'https://boracaya.com/events',
};
