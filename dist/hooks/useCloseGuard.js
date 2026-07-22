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
exports.useCloseGuard = void 0;
const React = __importStar(require("react"));
/**
 * Loss prevention for overlays that own their own Save (cdk#1007): the guest
 * drawer and the Steps editor dialog. Both close on a backdrop click or Escape,
 * which discarded unsaved edits silently — the shell's navigation guard never
 * sees these because closing an overlay is not navigation.
 *
 * Clean: close immediately. Dirty: ask first. The confirm state lives here so
 * each overlay renders the same dialog rather than inventing its own.
 */
const useCloseGuard = ({ dirty, onClose }) => {
    const [confirming, setConfirming] = React.useState(false);
    /** Wire this to the overlay's onClose AND its explicit close button. */
    const requestClose = React.useCallback(() => {
        if (dirty)
            setConfirming(true);
        else
            onClose();
    }, [dirty, onClose]);
    const discard = React.useCallback(() => {
        setConfirming(false);
        onClose();
    }, [onClose]);
    const keepEditing = React.useCallback(() => setConfirming(false), []);
    return { confirming, requestClose, discard, keepEditing };
};
exports.useCloseGuard = useCloseGuard;
