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
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.useStoredToggle = void 0;
const React = __importStar(require("react"));
/**
 * A two-value preference persisted in localStorage, storage-failure tolerant
 * (private mode / disabled storage still toggles for the session). Generalized
 * from Valet's operator light/dark switch (admin#74) so any app's binary,
 * remembered preference reads through one place.
 *
 * `values` must be a stable reference (a module-level `as const` tuple) — it is
 * a dependency of the returned `toggle`.
 */
const useStoredToggle = (key, values, initial = values[0]) => {
    const [value, setValue] = React.useState(() => {
        try {
            const stored = localStorage.getItem(key);
            return stored === values[0] || stored === values[1] ? stored : initial;
        }
        catch (_a) {
            return initial;
        }
    });
    const toggle = React.useCallback(() => {
        setValue((current) => {
            const next = current === values[0] ? values[1] : values[0];
            try {
                localStorage.setItem(key, next);
            }
            catch (_a) {
                // Storage unavailable (private mode) — the toggle still works for the session.
            }
            return next;
        });
    }, [key, values]);
    return [value, toggle];
};
exports.useStoredToggle = useStoredToggle;
