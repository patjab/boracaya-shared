import type { SaveLane } from '../saveLane';
/**
 * One Save button over N lanes (cdk#1007). Saves whichever lanes are dirty,
 * reports each honestly, and exposes per-lane dirty so a tab row can badge
 * exactly the tabs holding unsaved work instead of interrupting with a dialog.
 *
 * The lanes NEVER merge into one payload — see saveLane.ts for why that rule is
 * a data-loss guard rather than a preference.
 *
 * The outcome copy is INJECTED (`messages`) rather than read from a catalog
 * here, so the orchestration is app-agnostic and each app supplies its own
 * localized strings.
 */
export interface SaveGroupResult<K extends string> {
    /** Any lane dirty — drives the Save button's enabled state and the
     *  navigation guard for the whole screen. */
    dirty: boolean;
    /** Any lane in flight. */
    saving: boolean;
    /** Per-lane dirty, for the tab badges. */
    dirtyByLane: Record<K, boolean>;
    /** Save every dirty lane, then toast once for the combined outcome. */
    onSave: () => Promise<void>;
}
/** The three outcome strings, localized by the caller. */
export interface SaveGroupMessages {
    saved: string;
    saveError: string;
    /** The single-lane failure message, given that lane's guest-facing label. */
    laneFailed: (label: string) => string;
}
export declare const useSaveGroup: <K extends string>({ lanes, labels, onToast, messages }: {
    lanes: Record<K, SaveLane>;
    /** Guest-facing name per lane, used to say WHICH half failed. */
    labels: Record<K, string>;
    onToast: (msg: string) => void;
    messages: SaveGroupMessages;
}) => SaveGroupResult<K>;
