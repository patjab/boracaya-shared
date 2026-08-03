"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.inviteUrlFor = exports.guestSiteUrlFor = exports.SiteUrls = exports.envSubdomain = exports.isTest = exports.getEnv = exports.ApiRoutes = exports.PublicApi = exports.OrganizerInviteApi = exports.GuestEventApi = exports.FacesApi = exports.ApiConstants = exports.AdminEventApi = exports.AccountApi = void 0;
/**
 * Node-safe aggregate for contract tests, scripts, and backend tooling. Browser
 * identity, DOM adapters, React hooks, and MUI components are deliberately absent.
 */
__exportStar(require("./domain"), exports);
var api_1 = require("../api");
Object.defineProperty(exports, "AccountApi", { enumerable: true, get: function () { return api_1.AccountApi; } });
Object.defineProperty(exports, "AdminEventApi", { enumerable: true, get: function () { return api_1.AdminEventApi; } });
Object.defineProperty(exports, "ApiConstants", { enumerable: true, get: function () { return api_1.ApiConstants; } });
Object.defineProperty(exports, "FacesApi", { enumerable: true, get: function () { return api_1.FacesApi; } });
Object.defineProperty(exports, "GuestEventApi", { enumerable: true, get: function () { return api_1.GuestEventApi; } });
Object.defineProperty(exports, "OrganizerInviteApi", { enumerable: true, get: function () { return api_1.OrganizerInviteApi; } });
Object.defineProperty(exports, "PublicApi", { enumerable: true, get: function () { return api_1.PublicApi; } });
var routes_1 = require("../routes");
Object.defineProperty(exports, "ApiRoutes", { enumerable: true, get: function () { return routes_1.ApiRoutes; } });
var env_1 = require("../env");
Object.defineProperty(exports, "getEnv", { enumerable: true, get: function () { return env_1.getEnv; } });
Object.defineProperty(exports, "isTest", { enumerable: true, get: function () { return env_1.isTest; } });
Object.defineProperty(exports, "envSubdomain", { enumerable: true, get: function () { return env_1.envSubdomain; } });
var siteUrls_1 = require("../siteUrls");
Object.defineProperty(exports, "SiteUrls", { enumerable: true, get: function () { return siteUrls_1.SiteUrls; } });
Object.defineProperty(exports, "guestSiteUrlFor", { enumerable: true, get: function () { return siteUrls_1.guestSiteUrlFor; } });
Object.defineProperty(exports, "inviteUrlFor", { enumerable: true, get: function () { return siteUrls_1.inviteUrlFor; } });
