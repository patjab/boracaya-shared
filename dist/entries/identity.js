"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.unlinkIdentity = exports.loginNoEvent = exports.guestLinkedEmail = exports.guestAuthHeaders = exports.ensureGuestToken = exports.clearGuestToken = exports.claimIdentity = exports.signOut = exports.initAuth = exports.getIdToken = exports.getEmail = exports.authHeaders = void 0;
/** Browser identity and guest-token operations. UI controls live in `boracaya-shared/ui`. */
var auth_1 = require("../auth");
Object.defineProperty(exports, "authHeaders", { enumerable: true, get: function () { return auth_1.authHeaders; } });
Object.defineProperty(exports, "getEmail", { enumerable: true, get: function () { return auth_1.getEmail; } });
Object.defineProperty(exports, "getIdToken", { enumerable: true, get: function () { return auth_1.getIdToken; } });
Object.defineProperty(exports, "initAuth", { enumerable: true, get: function () { return auth_1.initAuth; } });
Object.defineProperty(exports, "signOut", { enumerable: true, get: function () { return auth_1.signOut; } });
var guestAuth_1 = require("../guestAuth");
Object.defineProperty(exports, "claimIdentity", { enumerable: true, get: function () { return guestAuth_1.claimIdentity; } });
Object.defineProperty(exports, "clearGuestToken", { enumerable: true, get: function () { return guestAuth_1.clearGuestToken; } });
Object.defineProperty(exports, "ensureGuestToken", { enumerable: true, get: function () { return guestAuth_1.ensureGuestToken; } });
Object.defineProperty(exports, "guestAuthHeaders", { enumerable: true, get: function () { return guestAuth_1.guestAuthHeaders; } });
Object.defineProperty(exports, "guestLinkedEmail", { enumerable: true, get: function () { return guestAuth_1.guestLinkedEmail; } });
Object.defineProperty(exports, "loginNoEvent", { enumerable: true, get: function () { return guestAuth_1.loginNoEvent; } });
Object.defineProperty(exports, "unlinkIdentity", { enumerable: true, get: function () { return guestAuth_1.unlinkIdentity; } });
