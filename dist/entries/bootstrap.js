"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isShellKey = exports.TYPE_VOICES = exports.SHELL_KEYS = exports.OCCASION_DEFAULTS = exports.FALLBACK_DEFAULTS = exports.CURATED_DESIGNS = exports.inviteUrlFor = exports.guestSiteUrlFor = exports.SiteUrls = exports.envSubdomain = exports.isTest = exports.getEnv = exports.sendJson = exports.jsonOr = exports.getJson = exports.ApiError = exports.GuestEventApi = exports.PublicApi = void 0;
/**
 * Shore's initial application seam: environment-aware public endpoints, reads,
 * event/shell contracts, and site links. It intentionally excludes admin
 * clients, shared form UI, and React hooks.
 */
var publicApi_1 = require("../publicApi");
Object.defineProperty(exports, "PublicApi", { enumerable: true, get: function () { return publicApi_1.PublicApi; } });
Object.defineProperty(exports, "GuestEventApi", { enumerable: true, get: function () { return publicApi_1.GuestEventApi; } });
var data_1 = require("../data");
Object.defineProperty(exports, "ApiError", { enumerable: true, get: function () { return data_1.ApiError; } });
Object.defineProperty(exports, "getJson", { enumerable: true, get: function () { return data_1.getJson; } });
Object.defineProperty(exports, "jsonOr", { enumerable: true, get: function () { return data_1.jsonOr; } });
Object.defineProperty(exports, "sendJson", { enumerable: true, get: function () { return data_1.sendJson; } });
var env_1 = require("../env");
Object.defineProperty(exports, "getEnv", { enumerable: true, get: function () { return env_1.getEnv; } });
Object.defineProperty(exports, "isTest", { enumerable: true, get: function () { return env_1.isTest; } });
Object.defineProperty(exports, "envSubdomain", { enumerable: true, get: function () { return env_1.envSubdomain; } });
var siteUrls_1 = require("../siteUrls");
Object.defineProperty(exports, "SiteUrls", { enumerable: true, get: function () { return siteUrls_1.SiteUrls; } });
Object.defineProperty(exports, "guestSiteUrlFor", { enumerable: true, get: function () { return siteUrls_1.guestSiteUrlFor; } });
Object.defineProperty(exports, "inviteUrlFor", { enumerable: true, get: function () { return siteUrls_1.inviteUrlFor; } });
var shells_1 = require("../shells");
Object.defineProperty(exports, "CURATED_DESIGNS", { enumerable: true, get: function () { return shells_1.CURATED_DESIGNS; } });
Object.defineProperty(exports, "FALLBACK_DEFAULTS", { enumerable: true, get: function () { return shells_1.FALLBACK_DEFAULTS; } });
Object.defineProperty(exports, "OCCASION_DEFAULTS", { enumerable: true, get: function () { return shells_1.OCCASION_DEFAULTS; } });
Object.defineProperty(exports, "SHELL_KEYS", { enumerable: true, get: function () { return shells_1.SHELL_KEYS; } });
Object.defineProperty(exports, "TYPE_VOICES", { enumerable: true, get: function () { return shells_1.TYPE_VOICES; } });
Object.defineProperty(exports, "isShellKey", { enumerable: true, get: function () { return shells_1.isShellKey; } });
