/**
 * The shell side of the navigation guard (#610): a mounted editor registers its
 * dirty-getter; any navigation that would leave it (tab/subtab switch, "Your
 * events", "Sign out") is intercepted with a confirm when there are unsaved
 * edits.
 *
 * A SET of getters, not a single slot (cdk#984): an editor can nest another
 * editor, so two guards can be live at once — each unregister removes only its
 * own getter, and navigation is dirty when ANY registrant says so.
 */
export declare const useUnsavedGuardHost: () => {
    guardValue: {
        register: (isDirty: () => boolean) => () => void;
    };
    guard: (action: () => void) => void;
    pending: (() => void) | null;
    proceed: () => void;
    stay: () => void;
};
