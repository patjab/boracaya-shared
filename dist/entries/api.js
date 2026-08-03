"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ApiRoutes = exports.PublicApi = exports.OrganizerInviteApi = exports.GuestEventApi = exports.FacesApi = exports.ApiConstants = exports.AdminEventApi = exports.AccountApi = void 0;
/** Environment-aware endpoint contracts. Fetch/cache behavior lives in `client`. */
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
